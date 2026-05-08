/**
 * Supplier aging report helper.
 *
 * Single entry point: getSupplierAgingReport(businessId, asOf).
 * All aging arithmetic is server-side; asOf is always passed in explicitly
 * so the report is deterministic and safe to use in tests and CSV exports.
 *
 * Excluded from results:
 *  - Invoices whose outstanding balance is 0 (PAID, RETURNED, VOID,
 *    or part-paid to zero) — computeOutstandingBalance returns 0 for these.
 *  - Invoices where supplierId is null (orphaned purchase data without a
 *    linked supplier record) — these cannot be attributed to any row.
 */

import { prisma } from '@/lib/prisma';
import { computeOutstandingBalance } from '@/lib/accounting';

export type AgingBucket = 'CURRENT' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS';

export const AGING_BUCKETS: readonly AgingBucket[] = [
  'CURRENT',
  'D1_30',
  'D31_60',
  'D61_90',
  'D90_PLUS',
];

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  CURRENT: 'Current',
  D1_30: '1–30 days',
  D31_60: '31–60 days',
  D61_90: '61–90 days',
  D90_PLUS: '90+ days',
};

export type SupplierAgingRow = {
  supplierId: string;
  supplierName: string;
  totalPence: number;
  buckets: Record<AgingBucket, number>;
  invoiceCount: number;
  /** Earliest non-null dueDate across the supplier's outstanding invoices. */
  oldestDueDate: Date | null;
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

/**
 * Pure classifier — no Date.now() inside. asOf must be passed in from the
 * caller so the result is deterministic for any given report date.
 *
 * Days overdue = floor((UTC start-of-day(asOf) − UTC start-of-day(dueDate)) / 86_400_000)
 * A null dueDate is treated as Current (not yet actionable).
 */
export function bucketForDaysOverdue(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 30) return 'D1_30';
  if (daysOverdue <= 60) return 'D31_60';
  if (daysOverdue <= 90) return 'D61_90';
  return 'D90_PLUS';
}

function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function zeroBuckets(): Record<AgingBucket, number> {
  return { CURRENT: 0, D1_30: 0, D31_60: 0, D61_90: 0, D90_PLUS: 0 };
}

export async function getSupplierAgingReport(
  businessId: string,
  asOf: Date,
): Promise<SupplierAgingReport> {
  const asOfDay = utcStartOfDay(asOf);

  const invoices = await prisma.purchaseInvoice.findMany({
    where: {
      businessId,
      paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
    },
    select: {
      id: true,
      dueDate: true,
      totalPence: true,
      paymentStatus: true,
      supplierId: true,
      supplier: { select: { id: true, name: true } },
      payments: { select: { amountPence: true } },
    },
  });

  const supplierMap = new Map<
    string,
    Omit<SupplierAgingRow, 'totalPence'> & { totalPence: number }
  >();

  for (const inv of invoices) {
    // Exclude invoices with no supplier
    if (!inv.supplierId || !inv.supplier) continue;

    const balance = computeOutstandingBalance(inv);
    if (balance <= 0) continue;

    const daysOverdue = inv.dueDate
      ? Math.floor((asOfDay.getTime() - utcStartOfDay(inv.dueDate).getTime()) / 86_400_000)
      : 0; // null dueDate → Current

    const bucket = bucketForDaysOverdue(daysOverdue);

    const existing = supplierMap.get(inv.supplierId);
    if (existing) {
      existing.totalPence += balance;
      existing.buckets[bucket] += balance;
      existing.invoiceCount += 1;
      if (
        inv.dueDate &&
        (!existing.oldestDueDate || inv.dueDate < existing.oldestDueDate)
      ) {
        existing.oldestDueDate = inv.dueDate;
      }
    } else {
      supplierMap.set(inv.supplierId, {
        supplierId: inv.supplierId,
        supplierName: inv.supplier.name,
        totalPence: balance,
        buckets: { ...zeroBuckets(), [bucket]: balance },
        invoiceCount: 1,
        oldestDueDate: inv.dueDate ?? null,
      });
    }
  }

  const rows: SupplierAgingRow[] = Array.from(supplierMap.values()).sort((a, b) => {
    if (b.totalPence !== a.totalPence) return b.totalPence - a.totalPence;
    // Tie-break: older due date ranks first
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
