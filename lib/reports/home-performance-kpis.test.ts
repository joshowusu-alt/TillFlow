/**
 * Parity: Home performance summary today revenue/tx vs shared sales-revenue contract.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    business: {
      findUnique: vi.fn(),
    },
    salesInvoice: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    shift: {
      findMany: vi.fn(),
    },
    product: {
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/reports/sales-revenue', () => ({
  getSalesRevenueSummary: vi.fn(),
}));

describe('getHomePerformanceSummary parity with Home KPI fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns today revenue/tx from shared sales-revenue contract and Today drill-down href', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { getSalesRevenueSummary } = await import('@/lib/reports/sales-revenue');
    const { getHomePerformanceSummary } = await import('@/lib/reports/home-performance-kpis');

    vi.mocked(prisma.business.findUnique).mockResolvedValueOnce({
      timezone: 'Africa/Accra',
    } as never);

    vi.mocked(getSalesRevenueSummary).mockResolvedValueOnce({
      salesRevenuePence: 12_238_50,
      transactionCount: 114,
      creditSalesOutstandingPence: 0,
    });

    vi.mocked(prisma.salesInvoice.aggregate).mockResolvedValueOnce({
      _sum: { totalPence: 9_593_00 },
      _count: { id: 85 },
      _avg: {},
      _min: {},
      _max: {},
    } as never);

    vi.mocked(prisma.shift.findMany).mockResolvedValueOnce([
      { expectedCashPence: 8_919_00 },
    ] as never);
    vi.mocked(prisma.product.count).mockResolvedValueOnce(1250);

    const summary = await getHomePerformanceSummary(
      'biz-1',
      new Date('2026-08-07T10:00:00.000Z'),
    );

    expect(summary.todayRevenuePence).toBe(12_238_50);
    expect(summary.todayTransactionCount).toBe(114);
    expect(summary.yesterdayRevenuePence).toBe(9_593_00);
    expect(summary.yesterdayTransactionCount).toBe(85);
    expect(summary.expectedCashPence).toBe(8_919_00);
    expect(summary.openShiftCount).toBe(1);
    expect(summary.productCount).toBe(1250);
    expect(summary.timeZone).toBe('Africa/Accra');
    expect(summary.todayScope.periodKey).toBe('today');
    expect(summary.tradingReportHref).toContain('period=today');
    expect(summary.tradingReportHref).toContain('storeId=ALL');

    expect(getSalesRevenueSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        periodKey: 'today',
        storeId: 'ALL',
      }),
    );
  });
});
