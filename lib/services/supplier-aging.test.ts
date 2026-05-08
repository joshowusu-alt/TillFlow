import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    purchaseInvoice: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/accounting', () => ({
  computeOutstandingBalance: vi.fn(({ totalPence, payments }) => {
    const paid = payments.reduce((s: number, p: { amountPence: number }) => s + p.amountPence, 0);
    return Math.max(totalPence - paid, 0);
  }),
}));

import {
  bucketForDaysOverdue,
  getSupplierAgingReport,
  AGING_BUCKET_LABELS,
  AGING_BUCKETS,
} from './supplier-aging';

const BIZ = 'biz-1';
const now = new Date('2024-06-15T12:00:00Z'); // Saturday 15 June 2024

function makeInvoice(
  overrides: {
    id?: string;
    supplierId?: string | null;
    supplierName?: string;
    dueDate?: string | null;
    totalPence?: number;
    paid?: number;
    paymentStatus?: string;
  } = {},
) {
  const {
    id = 'inv-1',
    supplierId = 'sup-1',
    supplierName = 'Alpha Supplies',
    dueDate = '2024-05-01',
    totalPence = 10_000,
    paid = 0,
    paymentStatus = 'UNPAID',
  } = overrides;
  return {
    id,
    dueDate: dueDate ? new Date(dueDate) : null,
    totalPence,
    paymentStatus,
    supplierId,
    supplier: supplierId ? { id: supplierId, name: supplierName } : null,
    payments: paid > 0 ? [{ amountPence: paid }] : [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('bucketForDaysOverdue', () => {
  it('returns CURRENT for 0 days', () => {
    expect(bucketForDaysOverdue(0)).toBe('CURRENT');
  });
  it('returns CURRENT for negative days', () => {
    expect(bucketForDaysOverdue(-5)).toBe('CURRENT');
  });
  it('returns D1_30 for 1 day', () => {
    expect(bucketForDaysOverdue(1)).toBe('D1_30');
  });
  it('returns D1_30 for 30 days', () => {
    expect(bucketForDaysOverdue(30)).toBe('D1_30');
  });
  it('returns D31_60 for 31 days', () => {
    expect(bucketForDaysOverdue(31)).toBe('D31_60');
  });
  it('returns D61_90 for 61 days', () => {
    expect(bucketForDaysOverdue(61)).toBe('D61_90');
  });
  it('returns D90_PLUS for 91 days', () => {
    expect(bucketForDaysOverdue(91)).toBe('D90_PLUS');
  });
});

describe('AGING_BUCKETS / AGING_BUCKET_LABELS', () => {
  it('exports exactly 5 buckets', () => {
    expect(AGING_BUCKETS).toHaveLength(5);
  });
  it('every bucket has a label', () => {
    for (const b of AGING_BUCKETS) {
      expect(AGING_BUCKET_LABELS[b]).toBeTypeOf('string');
    }
  });
});

describe('getSupplierAgingReport', () => {
  it('returns all-zero totals and empty rows for empty business', async () => {
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([]);
    const report = await getSupplierAgingReport(BIZ, now);
    expect(report.rows).toHaveLength(0);
    expect(report.totals.totalPence).toBe(0);
    expect(report.totals.supplierCount).toBe(0);
  });

  it('puts invoice with null dueDate in Current bucket', async () => {
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([
      makeInvoice({ dueDate: null, totalPence: 5_000 }),
    ]);
    const report = await getSupplierAgingReport(BIZ, now);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].buckets.CURRENT).toBe(5_000);
    expect(report.rows[0].oldestDueDate).toBeNull();
  });

  it('puts invoice 5 days overdue in D1_30 bucket', async () => {
    // asOf = 2024-06-15, dueDate = 2024-06-10 → 5 days overdue
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([
      makeInvoice({ dueDate: '2024-06-10', totalPence: 8_000 }),
    ]);
    const report = await getSupplierAgingReport(BIZ, now);
    expect(report.rows[0].buckets.D1_30).toBe(8_000);
    expect(report.rows[0].buckets.CURRENT).toBe(0);
  });

  it('correctly splits three invoices from one supplier across buckets', async () => {
    // dueDate 10 days ago → D1_30
    // dueDate 40 days ago → D31_60
    // dueDate 80 days ago → D61_90
    const d10 = new Date(now.getTime() - 10 * 86_400_000).toISOString().slice(0, 10);
    const d40 = new Date(now.getTime() - 40 * 86_400_000).toISOString().slice(0, 10);
    const d80 = new Date(now.getTime() - 80 * 86_400_000).toISOString().slice(0, 10);
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([
      makeInvoice({ id: 'i1', dueDate: d10, totalPence: 1_000 }),
      makeInvoice({ id: 'i2', dueDate: d40, totalPence: 2_000 }),
      makeInvoice({ id: 'i3', dueDate: d80, totalPence: 3_000 }),
    ]);
    const report = await getSupplierAgingReport(BIZ, now);
    const row = report.rows[0];
    expect(row.totalPence).toBe(6_000);
    expect(row.invoiceCount).toBe(3);
    expect(row.buckets.D1_30).toBe(1_000);
    expect(row.buckets.D31_60).toBe(2_000);
    expect(row.buckets.D61_90).toBe(3_000);
  });

  it('excludes PAID and RETURNED invoices (balance 0)', async () => {
    // computeOutstandingBalance mock returns 0 when total == paid
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([
      makeInvoice({ id: 'i1', totalPence: 5_000, paid: 5_000 }),
    ]);
    const report = await getSupplierAgingReport(BIZ, now);
    expect(report.rows).toHaveLength(0);
  });

  it('sorts suppliers by totalPence desc, then oldestDueDate asc on tie', async () => {
    const older = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);
    const newer = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([
      makeInvoice({ id: 'i1', supplierId: 'sup-1', supplierName: 'B Corp', dueDate: newer, totalPence: 10_000 }),
      makeInvoice({ id: 'i2', supplierId: 'sup-2', supplierName: 'A Corp', dueDate: older, totalPence: 10_000 }),
    ]);
    const report = await getSupplierAgingReport(BIZ, now);
    expect(report.rows[0].supplierName).toBe('A Corp');
    expect(report.rows[1].supplierName).toBe('B Corp');
  });

  it('excludes invoices where supplierId is null', async () => {
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([
      makeInvoice({ supplierId: null, totalPence: 9_000 }),
    ]);
    const report = await getSupplierAgingReport(BIZ, now);
    expect(report.rows).toHaveLength(0);
  });

  it('correctly uses past asOf — invoice not yet overdue on that date goes to Current', async () => {
    // asOf = 2024-01-01, dueDate = 2024-01-15 → daysOverdue negative → CURRENT
    const pastAsOf = new Date('2024-01-01T00:00:00Z');
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([
      makeInvoice({ dueDate: '2024-01-15', totalPence: 5_000 }),
    ]);
    const report = await getSupplierAgingReport(BIZ, pastAsOf);
    expect(report.rows[0].buckets.CURRENT).toBe(5_000);
    for (const b of ['D1_30', 'D31_60', 'D61_90', 'D90_PLUS'] as const) {
      expect(report.rows[0].buckets[b]).toBe(0);
    }
  });

  it('correctly reports invoice 100+ days overdue in D90_PLUS', async () => {
    const d100 = new Date(now.getTime() - 100 * 86_400_000).toISOString().slice(0, 10);
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([
      makeInvoice({ dueDate: d100, totalPence: 7_000 }),
    ]);
    const report = await getSupplierAgingReport(BIZ, now);
    expect(report.rows[0].buckets.D90_PLUS).toBe(7_000);
    expect(report.totals.buckets.D90_PLUS).toBe(7_000);
  });

  it('re-categorizes when dueDate is changed later on an existing invoice', async () => {
    // First fetch: invoice has no due date (historical credit purchase) -> CURRENT
    prismaMock.purchaseInvoice.findMany.mockResolvedValueOnce([
      makeInvoice({ id: 'retro-1', dueDate: null, totalPence: 9_000 }),
    ]);

    const beforeEdit = await getSupplierAgingReport(BIZ, now);
    expect(beforeEdit.rows[0].buckets.CURRENT).toBe(9_000);
    expect(beforeEdit.rows[0].buckets.D31_60).toBe(0);

    // Second fetch: user later amends dueDate to 45 days ago -> D31_60
    const d45 = new Date(now.getTime() - 45 * 86_400_000).toISOString().slice(0, 10);
    prismaMock.purchaseInvoice.findMany.mockResolvedValueOnce([
      makeInvoice({ id: 'retro-1', dueDate: d45, totalPence: 9_000 }),
    ]);

    const afterEdit = await getSupplierAgingReport(BIZ, now);
    expect(afterEdit.rows[0].buckets.CURRENT).toBe(0);
    expect(afterEdit.rows[0].buckets.D31_60).toBe(9_000);
  });
});
