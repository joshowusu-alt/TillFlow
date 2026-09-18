import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  bucketForDueDate,
  getSupplierAgingInvoices,
  getSupplierAgingReport,
  parseAgingBucket,
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
    transactionNumber?: string | null;
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
    transactionNumber = null,
  } = overrides;
  return {
    id,
    transactionNumber,
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
  it('returns NOT_YET_DUE for 0 days', () => {
    expect(bucketForDaysOverdue(0)).toBe('NOT_YET_DUE');
  });
  it('returns NOT_YET_DUE for negative days', () => {
    expect(bucketForDaysOverdue(-5)).toBe('NOT_YET_DUE');
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
  it('returns OVER_90 for 91 days', () => {
    expect(bucketForDaysOverdue(91)).toBe('OVER_90');
  });
});

describe('AGING_BUCKETS / AGING_BUCKET_LABELS', () => {
  it('exports the walkthrough contract buckets including missing due dates', () => {
    expect(AGING_BUCKETS).toEqual([
      'NOT_YET_DUE',
      'D1_30',
      'D31_60',
      'D61_90',
      'OVER_90',
      'DUE_DATE_MISSING',
    ]);
  });
  it('every bucket has a label', () => {
    for (const b of AGING_BUCKETS) {
      expect(AGING_BUCKET_LABELS[b]).toBeTypeOf('string');
    }
  });
  it('parses only known bucket query values', () => {
    expect(parseAgingBucket('D1_30')).toBe('D1_30');
    expect(parseAgingBucket('CURRENT')).toBeUndefined();
    expect(parseAgingBucket('')).toBeUndefined();
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

  it('puts invoice with null dueDate in DUE_DATE_MISSING, not current', async () => {
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([
      makeInvoice({ dueDate: null, totalPence: 5_000 }),
    ]);
    const report = await getSupplierAgingReport(BIZ, now);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].buckets.DUE_DATE_MISSING).toBe(5_000);
    expect(report.rows[0].buckets.NOT_YET_DUE).toBe(0);
    expect(report.rows[0].oldestDueDate).toBeNull();
    expect(bucketForDueDate(now, null)).toBe('DUE_DATE_MISSING');
  });

  it('puts invoice 5 days overdue in D1_30 bucket', async () => {
    // asOf = 2024-06-15, dueDate = 2024-06-10 → 5 days overdue
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([
      makeInvoice({ dueDate: '2024-06-10', totalPence: 8_000 }),
    ]);
    const report = await getSupplierAgingReport(BIZ, now);
    expect(report.rows[0].buckets.D1_30).toBe(8_000);
    expect(report.rows[0].buckets.NOT_YET_DUE).toBe(0);
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

  it('correctly uses past asOf — invoice not yet overdue on that date goes to NOT_YET_DUE', async () => {
    const pastAsOf = new Date('2024-01-01T00:00:00Z');
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([
      makeInvoice({ dueDate: '2024-01-15', totalPence: 5_000 }),
    ]);
    const report = await getSupplierAgingReport(BIZ, pastAsOf);
    expect(report.rows[0].buckets.NOT_YET_DUE).toBe(5_000);
    for (const b of ['D1_30', 'D31_60', 'D61_90', 'OVER_90', 'DUE_DATE_MISSING'] as const) {
      expect(report.rows[0].buckets[b]).toBe(0);
    }
  });

  it('correctly reports invoice 100+ days overdue in OVER_90', async () => {
    const d100 = new Date(now.getTime() - 100 * 86_400_000).toISOString().slice(0, 10);
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([
      makeInvoice({ dueDate: d100, totalPence: 7_000 }),
    ]);
    const report = await getSupplierAgingReport(BIZ, now);
    expect(report.rows[0].buckets.OVER_90).toBe(7_000);
    expect(report.totals.buckets.OVER_90).toBe(7_000);
  });

  it('re-categorizes when dueDate is changed later on an existing invoice', async () => {
    prismaMock.purchaseInvoice.findMany.mockResolvedValueOnce([
      makeInvoice({ id: 'retro-1', dueDate: null, totalPence: 9_000 }),
    ]);

    const beforeEdit = await getSupplierAgingReport(BIZ, now);
    expect(beforeEdit.rows[0].buckets.DUE_DATE_MISSING).toBe(9_000);
    expect(beforeEdit.rows[0].buckets.NOT_YET_DUE).toBe(0);
    expect(beforeEdit.rows[0].buckets.D31_60).toBe(0);

    const d45 = new Date(now.getTime() - 45 * 86_400_000).toISOString().slice(0, 10);
    prismaMock.purchaseInvoice.findMany.mockResolvedValueOnce([
      makeInvoice({ id: 'retro-1', dueDate: d45, totalPence: 9_000 }),
    ]);

    const afterEdit = await getSupplierAgingReport(BIZ, now);
    expect(afterEdit.rows[0].buckets.DUE_DATE_MISSING).toBe(0);
    expect(afterEdit.rows[0].buckets.D31_60).toBe(9_000);
  });

  it('lists invoices for a drill-down bucket without changing asOf', async () => {
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([
      makeInvoice({ id: 'missing', dueDate: null, totalPence: 4_000, transactionNumber: 'PUR-000009' }),
      makeInvoice({ id: 'overdue', dueDate: '2024-06-01', totalPence: 2_000 }),
    ]);
    const invoices = await getSupplierAgingInvoices(BIZ, now, 'DUE_DATE_MISSING');
    expect(invoices).toHaveLength(1);
    expect(invoices[0].id).toBe('missing');
    expect(invoices[0].bucket).toBe('DUE_DATE_MISSING');
    expect(invoices[0].outstandingPence).toBe(4_000);
  });

  it('reconciles a populated multi-supplier fixture across totals, buckets and partial payments', async () => {
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([
      makeInvoice({
        id: 'alpha-current',
        supplierId: 'sup-alpha',
        supplierName: 'Alpha Trading Co',
        dueDate: '2024-06-20',
        totalPence: 1_250_000,
      }),
      makeInvoice({
        id: 'alpha-d1',
        supplierId: 'sup-alpha',
        supplierName: 'Alpha Trading Co',
        dueDate: '2024-06-01',
        totalPence: 500_000,
        paid: 100_000,
        paymentStatus: 'PART_PAID',
      }),
      makeInvoice({
        id: 'beta-d31',
        supplierId: 'sup-beta',
        supplierName: 'Beta Wholesalers Ltd',
        dueDate: '2024-05-01',
        totalPence: 2_345_678,
      }),
      makeInvoice({
        id: 'beta-d90',
        supplierId: 'sup-beta',
        supplierName: 'Beta Wholesalers Ltd',
        dueDate: '2024-02-01',
        totalPence: 9_876_543,
      }),
    ]);

    const report = await getSupplierAgingReport(BIZ, now);

    expect(report.rows).toHaveLength(2);
    expect(report.totals.supplierCount).toBe(2);
    expect(report.totals.invoiceCount).toBe(4);

    const alpha = report.rows.find((row) => row.supplierId === 'sup-alpha');
    expect(alpha).toBeTruthy();
    expect(alpha!.totalPence).toBe(1_650_000);
    expect(alpha!.buckets.NOT_YET_DUE).toBe(1_250_000);
    expect(alpha!.buckets.D1_30).toBe(400_000);

    const beta = report.rows.find((row) => row.supplierId === 'sup-beta');
    expect(beta).toBeTruthy();
    expect(beta!.totalPence).toBe(12_222_221);
    expect(beta!.buckets.D31_60).toBe(2_345_678);
    expect(beta!.buckets.OVER_90).toBe(9_876_543);

    expect(report.totals.totalPence).toBe(1_650_000 + 12_222_221);
    expect(report.totals.buckets.NOT_YET_DUE).toBe(1_250_000);
    expect(report.totals.buckets.D1_30).toBe(400_000);
    expect(report.totals.buckets.D31_60).toBe(2_345_678);
    expect(report.totals.buckets.OVER_90).toBe(9_876_543);

    const rowSum = report.rows.reduce((sum, row) => sum + row.totalPence, 0);
    expect(rowSum).toBe(report.totals.totalPence);
    for (const bucket of AGING_BUCKETS) {
      const bucketSum = report.rows.reduce((sum, row) => sum + row.buckets[bucket], 0);
      expect(bucketSum).toBe(report.totals.buckets[bucket]);
    }
  });
});

describe('supplier aging export route scope', () => {
  const exportSrc = readFileSync(
    join(process.cwd(), 'app/(protected)/payments/supplier-aging/export/route.ts'),
    'utf8',
  );

  it('keeps CSV scope on businessId, explicit asOf, and optional bucket', () => {
    expect(exportSrc).toContain("['MANAGER', 'OWNER'].includes(user.role)");
    expect(exportSrc).toContain('user.businessId');
    expect(exportSrc).toContain("searchParams.get('asOf')");
    expect(exportSrc).toContain("searchParams.get('bucket')");
    expect(exportSrc).toContain('getSupplierAgingInvoices(user.businessId, asOf, bucket)');
    expect(exportSrc).toContain('getSupplierAgingReport(user.businessId, asOf)');
    expect(exportSrc).toContain('As Of,');
    expect(exportSrc).toContain('Scope,');
  });
});
