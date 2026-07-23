/**
 * Parity: Home performance summary today revenue/tx vs getTodayKPIs fields
 * used historically by Owner Home.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
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

vi.mock('@/lib/reports/sqlite-report-date-normalization', () => ({
  ensureSqliteReportDateColumnsNormalized: vi.fn().mockResolvedValue(undefined),
  isSqliteRuntime: vi.fn().mockReturnValue(false),
  isDateWithinRange: vi.fn(),
}));

describe('getHomePerformanceSummary parity with Home KPI fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns today revenue/tx matching getTodayKPIs aggregate shape', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { getHomePerformanceSummary } = await import('@/lib/reports/home-performance-kpis');

    vi.mocked(prisma.salesInvoice.aggregate)
      .mockResolvedValueOnce({
        _sum: { totalPence: 12_238_50 },
        _count: { id: 114 },
        _avg: {},
        _min: {},
        _max: {},
      } as never)
      .mockResolvedValueOnce({
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

    const summary = await getHomePerformanceSummary('biz-1');

    expect(summary.todayRevenuePence).toBe(12_238_50);
    expect(summary.todayTransactionCount).toBe(114);
    expect(summary.yesterdayRevenuePence).toBe(9_593_00);
    expect(summary.yesterdayTransactionCount).toBe(85);
    expect(summary.expectedCashPence).toBe(8_919_00);
    expect(summary.openShiftCount).toBe(1);
    expect(summary.productCount).toBe(1250);

    // Today aggregate must not include DEMO_DAY exclusion (match getTodayKPIs).
    const todayCall = vi.mocked(prisma.salesInvoice.aggregate).mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(todayCall.where).not.toHaveProperty('OR');
    expect(todayCall.where.paymentStatus).toEqual({ notIn: ['RETURNED', 'VOID'] });
  });
});
