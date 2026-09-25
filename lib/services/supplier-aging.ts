/**
 * Supplier aging report helper.
 *
 * Single entry point: getSupplierAgingReport(businessId, asOf).
 * All aging arithmetic is server-side; asOf is always passed in explicitly
 * so the report is deterministic and safe to use in tests and CSV exports.
 *
 * Excluded from results:
 *  - Invoices whose outstanding balance is 0 (PAID, RETURNED, VOID,
 *    or part-paid to zero) — payableDocumentBalance returns 0 for these.
 *  - Invoices where supplierId is null (orphaned purchase data without a
 *    linked supplier record) — these cannot be attributed to any row.
 *
 * Missing due dates are DUE_DATE_MISSING, never current / not yet due.
 */

import { prisma } from '@/lib/prisma';
import { payableDocumentBalance } from '@/lib/reports/payables-balance';
import {
  type AgingBucket,
  AGING_BUCKETS,
  AGING_BUCKET_LABELS,
  bucketForDueDate,
} from '@/lib/reliability/walkthrough-contracts';

export type { AgingBucket };
export { AGING_BUCKETS, AGING_BUCKET_LABELS, bucketForDueDate };

/**
 * Days-overdue classifier for invoices that already have a due date.
 * Null due dates must use bucketForDueDate, not this helper.
 */
export function bucketForDaysOverdue(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'NOT_YET_DUE';
  if (daysOverdue <= 30) return 'D1_30';
  if (daysOverdue <= 60) return 'D31_60';
  if (daysOverdue <= 90) return 'D61_90';
  return 'OVER_90';
}

export function parseAgingBucket(raw: string | null | undefined): AgingBucket | undefined {
  if (!raw) return undefined;
  return (AGING_BUCKETS as readonly string[]).includes(raw) ? (raw as AgingBucket) : undefined;
}

export type SupplierAgingRow = {
  supplierId: string;
  supplierName: string;
  totalPence: number;
  buckets: Record<AgingBucket, number>;
  invoiceCount: number;
  /** Earliest non-null dueDate across the supplier's outstanding invoices. */
  oldestDueDate: Date | null;
};

export type SupplierAgingInvoice = {
  id: string;
  transactionNumber: string | null;
  supplierId: string;
  supplierName: string;
  dueDate: Date | null;
  totalPence: number;
  paidPence: number;
  outstandingPence: number;
  bucket: AgingBucket;
};

export type SupplierAgingReport = {
  asOf: Date;
  totals: {
    totalPence: number;
    buckets: Record<AgingBucket, number>;
    invoiceCount: number;
    supplierCount: number;
  };
  rows: SupplierAgingRow[];
};

type LoadedInvoice = {
  id: string;
  transactionNumber: string | null;
  dueDate: Date | null;
  totalPence: number;
  supplierId: string;
  supplierName: string;
  paidPence: number;
  outstandingPence: number;
  bucket: AgingBucket;
};

function zeroBuckets(): Record<AgingBucket, number> {
  return {
    NOT_YET_DUE: 0,
    D1_30: 0,
    D31_60: 0,
    D61_90: 0,
    OVER_90: 0,
    DUE_DATE_MISSING: 0,
  };
}

async function loadOutstandingAttributedInvoices(
  businessId: string,
  asOf: Date,
): Promise<LoadedInvoice[]> {
  const invoices = await prisma.purchaseInvoice.findMany({
    where: {
      businessId,
      supplierId: { not: null },
      paymentStatus: { notIn: ['RETURNED', 'VOID'] },
    },
    select: {
      id: true,
      transactionNumber: true,
      dueDate: true,
      totalPence: true,
      paymentStatus: true,
      supplierId: true,
      supplier: { select: { id: true, name: true } },
      payments: { select: { amountPence: true } },
    },
  });

  const loaded: LoadedInvoice[] = [];
  for (const inv of invoices) {
    if (!inv.supplierId || !inv.supplier) continue;
    const outstandingPence = payableDocumentBalance(inv).balancePence;
    if (outstandingPence <= 0) continue;
    const paidPence = inv.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
    loaded.push({
      id: inv.id,
      transactionNumber: inv.transactionNumber,
      dueDate: inv.dueDate,
      totalPence: inv.totalPence,
      supplierId: inv.supplierId,
      supplierName: inv.supplier.name,
      paidPence,
      outstandingPence,
      bucket: bucketForDueDate(asOf, inv.dueDate),
    });
  }
  return loaded;
}

export async function getSupplierAgingInvoices(
  businessId: string,
  asOf: Date,
  bucket?: AgingBucket,
): Promise<SupplierAgingInvoice[]> {
  const invoices = await loadOutstandingAttributedInvoices(businessId, asOf);
  const filtered = bucket ? invoices.filter((invoice) => invoice.bucket === bucket) : invoices;
  return filtered
    .map((invoice) => ({
      id: invoice.id,
      transactionNumber: invoice.transactionNumber,
      supplierId: invoice.supplierId,
      supplierName: invoice.supplierName,
      dueDate: invoice.dueDate,
      totalPence: invoice.totalPence,
      paidPence: invoice.paidPence,
      outstandingPence: invoice.outstandingPence,
      bucket: invoice.bucket,
    }))
    .sort((a, b) => {
      if (b.outstandingPence !== a.outstandingPence) return b.outstandingPence - a.outstandingPence;
      const aDue = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const bDue = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
      return aDue - bDue;
    });
}

export async function getSupplierAgingReport(
  businessId: string,
  asOf: Date,
): Promise<SupplierAgingReport> {
  const invoices = await loadOutstandingAttributedInvoices(businessId, asOf);

  const supplierMap = new Map<string, SupplierAgingRow>();

  for (const inv of invoices) {
    const existing = supplierMap.get(inv.supplierId);
    if (existing) {
      existing.totalPence += inv.outstandingPence;
      existing.buckets[inv.bucket] += inv.outstandingPence;
      existing.invoiceCount += 1;
      if (inv.dueDate && (!existing.oldestDueDate || inv.dueDate < existing.oldestDueDate)) {
        existing.oldestDueDate = inv.dueDate;
      }
    } else {
      supplierMap.set(inv.supplierId, {
        supplierId: inv.supplierId,
        supplierName: inv.supplierName,
        totalPence: inv.outstandingPence,
        buckets: { ...zeroBuckets(), [inv.bucket]: inv.outstandingPence },
        invoiceCount: 1,
        oldestDueDate: inv.dueDate ?? null,
      });
    }
  }

  const rows: SupplierAgingRow[] = Array.from(supplierMap.values()).sort((a, b) => {
    if (b.totalPence !== a.totalPence) return b.totalPence - a.totalPence;
    if (!a.oldestDueDate && !b.oldestDueDate) return 0;
    if (!a.oldestDueDate) return 1;
    if (!b.oldestDueDate) return -1;
    return a.oldestDueDate.getTime() - b.oldestDueDate.getTime();
  });

  const totalBuckets = zeroBuckets();
  let grandTotal = 0;
  let totalInvoices = 0;

  for (const row of rows) {
    grandTotal += row.totalPence;
    totalInvoices += row.invoiceCount;
    for (const b of AGING_BUCKETS) {
      totalBuckets[b] += row.buckets[b];
    }
  }

  return {
    asOf,
    totals: {
      totalPence: grandTotal,
      buckets: totalBuckets,
      invoiceCount: totalInvoices,
      supplierCount: rows.length,
    },
    rows,
  };
}
