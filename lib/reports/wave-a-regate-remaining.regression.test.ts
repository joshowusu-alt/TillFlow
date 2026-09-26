import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

const prismaMock = vi.hoisted(() => {
  function emptyDelegate() {
    return new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
      get(target, prop: string) {
        if (!(prop in target)) {
          target[prop] = prop === 'count'
            ? vi.fn(async () => 0)
            : prop === 'aggregate'
              ? vi.fn(async () => ({ _sum: { totalPence: 0, amountPence: 0, vatPence: 0, subtotalPence: 0 }, _count: { id: 0 } }))
              : vi.fn(async () => (prop === 'findUnique' || prop === 'findFirst' ? null : []));
        }
        return target[prop];
      },
    });
  }
  const base = {
    $executeRawUnsafe: vi.fn(async () => 0),
    business: { findUnique: vi.fn(async () => ({ timezone: 'Africa/Accra', openingCapitalPence: 0 })) },
    salesInvoice: {
      findMany: vi.fn(async () => []),
      aggregate: vi.fn(async () => ({ _sum: { totalPence: 0 }, _count: { id: 0 } })),
      count: vi.fn(async () => 0),
    },
    salesInvoiceLine: { findMany: vi.fn(async () => []) },
    messageOutbox: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({ id: 'out-1' })) },
  };
  return new Proxy(base, {
    get(target, prop: string) {
      if (!(prop in target)) (target as Record<string, unknown>)[prop] = emptyDelegate();
      return (target as Record<string, unknown>)[prop];
    },
  }) as any;
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/reports/money-received', () => ({
  aggregateMoneyReceivedByMethod: vi.fn(async () => []),
  aggregateConfirmedReceiptsThroughAsOf: vi.fn(async () => ({ amountPence: 0 })),
  requireMoneyReceivedMethodRows: (rows: unknown) => rows ?? [],
  resolveMoneyReceivedScope: (scope: unknown) => scope,
}));

import { businessDayWindow, businessWeekWindow } from '@/lib/reports/reporting-clock';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import { summarizeReceivables } from '@/lib/reports/operational-metrics';
import { buildDebtorsListingCsv } from '@/lib/exports/csv-writers';
import { enqueueOwnerDailySummarySms } from '@/lib/notifications/owner-daily-summary-sms';
import { getWeeklyDigestData } from '@/lib/reports/weekly-digest';
import { computeSalesComparisonFromDb } from '@/lib/reports/business-movement/query';
import { evaluateMarginSet } from '@/lib/reports/margin-line';

const SALE_AT = new Date('2026-03-15T10:00:00.000Z');
const discountedSale = {
  id: 'inv-gp',
  createdAt: SALE_AT,
  paymentStatus: 'PAID',
  discountPence: 0,
  vatPence: 0,
  totalPence: 1849,
  salesReturn: null,
  lines: [{
    productId: 'p1',
    qtyBase: 1,
    lineSubtotalPence: 2000,
    lineDiscountPence: 100,
    promoDiscountPence: 51,
    lineVatPence: 0,
    lineTotalPence: 1849,
    lineCostPence: 834,
    product: { name: 'Rice', defaultCostBasePence: 834, category: null },
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('remaining Wave A defects', () => {
  it('analytics uses canonical GP 1015 and withholds incomplete GP', async () => {
    const source = readFileSync(join(process.cwd(), 'app/(protected)/reports/analytics/AnalyticsContent.tsx'), 'utf8');
    expect(source).not.toContain('lineCostPence > 0');
    expect(source).not.toContain('getDay()');
    expect(source).not.toContain('getHours()');

    prismaMock.salesInvoice.findMany.mockImplementation(async (args: { where?: { createdAt?: { gte?: Date } } }) => {
      const gte = args?.where?.createdAt?.gte;
      if (gte && gte.getTime() < new Date('2026-03-01T00:00:00.000Z').getTime()) return [];
      return [discountedSale];
    });
    const { default: AnalyticsContent } = await import('@/app/(protected)/reports/analytics/AnalyticsContent');
    const view = await AnalyticsContent({ businessId: 'biz-1', currency: 'GHS', periodDays: 7, timeZone: 'Africa/Accra' });
    expect(view.props.kpis.totalProfit).toBe(1015);
    expect(view.props.kpis.marginPercent).toBe(Math.round((1015 / 1849) * 100));

    prismaMock.salesInvoice.findMany.mockResolvedValue([{
      ...discountedSale,
      lines: [{ ...discountedSale.lines[0], lineCostPence: 0, product: { ...discountedSale.lines[0].product, defaultCostBasePence: 0 } }],
    }]);
    const incomplete = await AnalyticsContent({ businessId: 'biz-1', currency: 'GHS', periodDays: 7, timeZone: 'Africa/Accra' });
    expect(incomplete.props.kpis.totalProfit).toBeNull();
    expect(incomplete.props.kpis.marginPercent).toBeNull();
    expect(incomplete.props.kpis.marginState).toBe('INCOMPLETE_COSTS');
  });

  it('report windows require an explicit business timezone', () => {
    const instant = new Date('2026-06-15T21:30:00.000Z');
    expect(() => businessDayWindow(instant, undefined as unknown as string)).toThrow(/timezone/i);
    expect(() => businessWeekWindow(instant, undefined as unknown as string)).toThrow(/timezone/i);
    expect(() => resolveReportDateRange(undefined, instant, instant)).toThrow(/timezone/i);
    const nairobi = businessDayWindow(instant, 'Africa/Nairobi');
    expect(nairobi.startInclusive.toISOString()).toBe('2026-06-15T21:00:00.000Z');
    expect(nairobi.endExclusive.toISOString()).toBe('2026-06-16T21:00:00.000Z');
    const prior = businessDayWindow(new Date(nairobi.startInclusive.getTime() - 1), 'Africa/Nairobi');
    expect(prior.endExclusive.toISOString()).toBe('2026-06-15T21:00:00.000Z');
    expect(instant.getTime() >= prior.endExclusive.getTime()).toBe(true);
  });

  it('summarizeReceivables does not treat a missing payment status as confirmed', () => {
    const summary = summarizeReceivables([{
      paymentStatus: 'UNPAID',
      totalPence: 12833,
      createdAt: SALE_AT,
      payments: [{ amountPence: 6000 }],
    }], SALE_AT);
    expect(summary.outstandingTotalPence).toBe(12833);
  });

  it('debtors export keeps a PAID shortfall inside canonical AR', async () => {
    prismaMock.salesInvoice.findMany.mockImplementation(async (args: { where?: { paymentStatus?: { in?: string[] } } }) => {
      const rows = [
        { id: 'a', transactionNumber: 'A', createdAt: SALE_AT, dueDate: SALE_AT, totalPence: 7000, paymentStatus: 'UNPAID', customer: { name: 'Ama', phone: null }, payments: [] },
        { id: 'b', transactionNumber: 'B', createdAt: SALE_AT, dueDate: SALE_AT, totalPence: 5833, paymentStatus: 'PAID', customer: { name: 'Ama', phone: null }, payments: [] },
      ];
      const allowed = args?.where?.paymentStatus?.in;
      return allowed ? rows.filter((row) => allowed.includes(row.paymentStatus)) : rows;
    });
    const csv = await buildDebtorsListingCsv('biz-1');
    expect(csv).toContain('58.33');
    expect(csv).toContain('128.33');
  });

  it('SMS overdue AR uses the canonical balance and does not cap an excess', async () => {
    const captured: { body?: string } = {};
    prismaMock.business.findUnique.mockResolvedValue({
      id: 'biz-1', name: 'Shop', currency: 'GHS', phone: '+233200000000', whatsappPhone: null,
      timezone: 'Africa/Accra', whatsappBranchScope: 'ALL', whatsappEnabled: true, isDemo: false, subscriptionStatus: 'ACTIVE',
    });
    prismaMock.salesInvoice.findMany.mockImplementation(async (args: { where?: { dueDate?: unknown }; select?: { payments?: unknown; lines?: unknown } }) => {
      if (args?.select?.lines) return [];
      if (args?.where?.dueDate) {
        return [{
          paymentStatus: 'UNPAID',
          totalPence: 10000,
          payments: [{ amountPence: 12000, status: 'CONFIRMED' }],
        }];
      }
      return [];
    });
    prismaMock.salesInvoice.aggregate.mockResolvedValue({ _sum: { totalPence: 18833 }, _count: { id: 1 } });
    prismaMock.messageOutbox.create.mockImplementation(async (args: { data: { body: string } }) => {
      captured.body = args.data.body;
      return { id: 'out-1' };
    });
    await enqueueOwnerDailySummarySms('biz-1', { now: SALE_AT, tx: prismaMock as never });
    expect(captured.body).toContain('Overdue customers GHS -20.00');
    expect(captured.body).not.toContain('Overdue customers GHS 0.00');
  });

  it('weekly digest and business movement keep an unallocated difference of 500', async () => {
    const zeroBase = {
      id: 'inv-z',
      paymentStatus: 'PAID',
      discountPence: 0,
      vatPence: 0,
      totalPence: 500,
      createdAt: SALE_AT,
      lines: [{
        productId: 'p1',
        qtyBase: 0,
        lineSubtotalPence: 0,
        lineDiscountPence: 0,
        promoDiscountPence: 0,
        lineVatPence: 0,
        lineTotalPence: 0,
        lineCostPence: 0,
        product: { id: 'p1', name: 'Rice', defaultCostBasePence: 0 },
      }],
    };
    prismaMock.salesInvoice.findMany.mockImplementation(async (args: { select?: { cashierUser?: unknown; lines?: unknown } }) => {
      if (args?.select?.cashierUser) return [];
      if (args?.select?.lines) return [zeroBase];
      return [zeroBase];
    });
    prismaMock.salesInvoice.aggregate.mockResolvedValue({ _sum: { totalPence: 500 }, _count: { id: 1 } });
    const digest = await getWeeklyDigestData('biz-1', new Date('2026-03-09T00:00:00.000Z'), new Date('2026-03-16T00:00:00.000Z'), 'Africa/Accra');
    expect(digest.unallocatedSalesDifferencePence).toBe(500);
    expect(digest.topSellers.some((row) => row.name === 'Unallocated sales difference')).toBe(true);

    const db = {
      salesInvoice: {
        findMany: vi.fn(async () => [zeroBase]),
        aggregate: vi.fn(async () => ({ _sum: { totalPence: 500 }, _count: { id: 1 } })),
        groupBy: vi.fn(async () => []),
      },
      salesInvoiceLine: { aggregate: vi.fn(async () => ({ _sum: { qtyBase: 0 } })) },
      product: { findMany: vi.fn(async () => [{ id: 'p1', name: 'Rice' }]) },
      store: { findMany: vi.fn(async () => []) },
      user: { findMany: vi.fn(async () => []) },
    };
    const comparison = await computeSalesComparisonFromDb(db as never, {
      businessId: 'biz-1',
      currency: 'GHS',
      timeZone: 'Africa/Accra',
      period: { preset: 'equal_length_custom', currentFromKey: '2026-03-01', currentToKey: '2026-03-15' },
    });
    const names = JSON.stringify(comparison);
    expect(names).toContain('Unallocated sales difference');
    expect(names).toContain('500');
  });

  it('canonical ready GP for the discount fixture is 1015', () => {
    const margin = evaluateMarginSet([{
      paymentStatus: 'PAID',
      discountPence: 0,
      lines: [{
        lineSubtotalPence: 2000,
        lineDiscountPence: 100,
        promoDiscountPence: 51,
        lineCostPence: 834,
        qtyBase: 1,
        defaultCostBasePence: 834,
      }],
    }]);
    expect(margin.grossProfitPence).toBe(1015);
    expect(margin.state).toBe('READY');
  });
});
