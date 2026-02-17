/**
 * CSV writer utilities for the Phase 3B Export Pack.
 * Each function returns a CSV string for one report section.
 */

import { prisma } from '@/lib/prisma';

/** Escape a value for CSV output. */
function esc(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const fp = (pence: number) => (pence / 100).toFixed(2);

interface DateRange {
  from: Date;
  to: Date;
}

// ---------------------------------------------------------------------------
// 1. Sales Ledger
// ---------------------------------------------------------------------------
export async function buildSalesLedgerCsv(businessId: string, range: DateRange): Promise<string> {
  const rows = await prisma.salesInvoice.findMany({
    where: { businessId, createdAt: { gte: range.from, lte: range.to } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, transactionNumber: true, createdAt: true, paymentStatus: true,
      subtotalPence: true, vatPence: true, discountPence: true, totalPence: true,
      customer: { select: { name: true } },
      store: { select: { name: true } },
      cashierUser: { select: { name: true } },
    },
  });
  const header = ['Ref','Date','Store','Cashier','Customer','Status','Subtotal','VAT','Discount','Total'].join(',');
  const lines = rows.map((r) =>
    [
      esc(r.transactionNumber ?? r.id.slice(0, 10)),
      esc(r.createdAt.toISOString()),
      esc(r.store?.name ?? ''),
      esc(r.cashierUser?.name ?? ''),
      esc(r.customer?.name ?? 'Walk-in'),
      esc(r.paymentStatus),
      esc(fp(r.subtotalPence)),
      esc(fp(r.vatPence)),
      esc(fp(r.discountPence)),
      esc(fp(r.totalPence)),
    ].join(',')
  );
  return [header, ...lines].join('\n');
}

// ---------------------------------------------------------------------------
// 2. Purchases Ledger
// ---------------------------------------------------------------------------
export async function buildPurchasesLedgerCsv(businessId: string, range: DateRange): Promise<string> {
  const rows = await prisma.purchaseInvoice.findMany({
    where: { businessId, createdAt: { gte: range.from, lte: range.to } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, createdAt: true, paymentStatus: true,
      subtotalPence: true, vatPence: true, totalPence: true,
      supplier: { select: { name: true } },
      store: { select: { name: true } },
    },
  });
  const header = ['Ref','Date','Store','Supplier','Status','Subtotal','VAT','Total'].join(',');
  const lines = rows.map((r) =>
    [
      esc(r.id.slice(0, 10)),
      esc(r.createdAt.toISOString()),
      esc(r.store?.name ?? ''),
      esc(r.supplier?.name ?? ''),
      esc(r.paymentStatus),
      esc(fp(r.subtotalPence)),
      esc(fp(r.vatPence ?? 0)),
      esc(fp(r.totalPence)),
    ].join(',')
  );
  return [header, ...lines].join('\n');
}

// ---------------------------------------------------------------------------
// 3. VAT Report (output tax from sales + input tax from purchases)
// ---------------------------------------------------------------------------
export async function buildVatReportCsv(businessId: string, range: DateRange): Promise<string> {
  const [salesVat, purchasesVat] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: { businessId, createdAt: { gte: range.from, lte: range.to } },
      _sum: { vatPence: true, subtotalPence: true, totalPence: true },
      _count: { id: true },
    }),
    prisma.purchaseInvoice.aggregate({
      where: { businessId, createdAt: { gte: range.from, lte: range.to } },
      _sum: { vatPence: true, subtotalPence: true, totalPence: true },
      _count: { id: true },
    }),
  ]);

  const outVat = salesVat._sum.vatPence ?? 0;
  const inVat = purchasesVat._sum.vatPence ?? 0;
  const netVat = outVat - inVat;

  const header = ['Section','Transactions','Net Sales/Purchases','VAT Amount'].join(',');
  const lines = [
    `Output Tax (Sales),${salesVat._count.id},${fp(salesVat._sum.subtotalPence ?? 0)},${fp(outVat)}`,
    `Input Tax (Purchases),${purchasesVat._count.id},${fp(purchasesVat._sum.subtotalPence ?? 0)},${fp(inVat)}`,
    `Net VAT Payable,,,"${fp(netVat)}"`,
    `Period,${range.from.toISOString().slice(0,10)},${range.to.toISOString().slice(0,10)},`,
  ];
  return [header, ...lines].join('\n');
}

// ---------------------------------------------------------------------------
// 4. Debtors Listing
// ---------------------------------------------------------------------------
export async function buildDebtorsListingCsv(businessId: string): Promise<string> {
  const debtors = await prisma.salesInvoice.findMany({
    where: { businessId, paymentStatus: { in: ['UNPAID', 'PARTIAL'] } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, transactionNumber: true, createdAt: true, dueDate: true,
      totalPence: true, paymentStatus: true,
      customer: { select: { name: true, phone: true } },
    },
  });

  const now = new Date();
  const header = ['Invoice','Date','Due Date','Customer','Phone','Status','Amount','Days Overdue'].join(',');
  const lines = debtors.map((d) => {
    const due = d.dueDate ?? d.createdAt;
    const daysOD = Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86400000));
    return [
      esc(d.transactionNumber ?? d.id.slice(0, 10)),
      esc(d.createdAt.toISOString().slice(0, 10)),
      esc(due.toISOString().slice(0, 10)),
      esc(d.customer?.name ?? ''),
      esc(d.customer?.phone ?? ''),
      esc(d.paymentStatus),
      esc(fp(d.totalPence)),
      esc(daysOD),
    ].join(',');
  });
  return [header, ...lines].join('\n');
}

// ---------------------------------------------------------------------------
// 5. Stock Movements
// ---------------------------------------------------------------------------
export async function buildStockMovementsCsv(businessId: string, range: DateRange): Promise<string> {
  const storeIds = (
    await prisma.store.findMany({ where: { businessId }, select: { id: true } })
  ).map((s) => s.id);

  const adjs = await prisma.stockAdjustment.findMany({
    where: { storeId: { in: storeIds }, createdAt: { gte: range.from, lte: range.to } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, createdAt: true, direction: true, qtyBase: true, reason: true,
      product: { select: { name: true, barcode: true } },
      store: { select: { name: true } },
      user: { select: { name: true } },
    },
  });

  const header = ['Date','Store','Product','Barcode','Direction','Qty','Reason','User'].join(',');
  const lines = adjs.map((a) =>
    [
      esc(a.createdAt.toISOString()),
      esc(a.store?.name ?? ''),
      esc(a.product?.name ?? ''),
      esc(a.product?.barcode ?? ''),
      esc(a.direction),
      esc(a.qtyBase),
      esc(a.reason ?? ''),
      esc(a.user?.name ?? ''),
    ].join(',')
  );
  return [header, ...lines].join('\n');
}
