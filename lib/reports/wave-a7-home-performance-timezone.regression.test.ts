/**
 * Focused unit boundary for getHomePerformanceSummary timezone rejection.
 * Used when the database cannot store a blank timezone, and as fail-before evidence
 * that a blank or invalid value must not become Africa/Accra.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    salesInvoice: { aggregate: vi.fn() },
    shift: { findMany: vi.fn() },
    product: { count: vi.fn() },
  },
}));

vi.mock('@/lib/reports/sales-revenue', () => ({
  getSalesRevenueSummary: vi.fn(),
}));

const BOUNDARY = new Date('2026-06-30T22:00:00.000Z');
const REQUIRED = 'Business timezone is required for report windows';

describe('getHomePerformanceSummary rejects a blank or invalid stored timezone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function load() {
    const { prisma } = await import('@/lib/prisma');
    const { getSalesRevenueSummary } = await import('@/lib/reports/sales-revenue');
    const { getHomePerformanceSummary } = await import('@/lib/reports/home-performance-kpis');
    return { prisma, getSalesRevenueSummary, getHomePerformanceSummary };
  }

  function stubSuccessfulReads(
    prisma: Awaited<ReturnType<typeof load>>['prisma'],
    getSalesRevenueSummary: Awaited<ReturnType<typeof load>>['getSalesRevenueSummary'],
  ) {
    vi.mocked(getSalesRevenueSummary).mockResolvedValue({
      salesRevenuePence: 0,
      transactionCount: 0,
      creditSalesOutstandingPence: 0,
    });
    vi.mocked(prisma.salesInvoice.aggregate).mockResolvedValue({
      _sum: { totalPence: 0 },
      _count: { id: 0 },
    } as never);
    vi.mocked(prisma.shift.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.product.count).mockResolvedValue(0);
  }

  it('preserves a stored Africa/Nairobi timezone', async () => {
    const { prisma, getSalesRevenueSummary, getHomePerformanceSummary } = await load();
    vi.mocked(prisma.business.findUnique).mockResolvedValue({ timezone: 'Africa/Nairobi' } as never);
    stubSuccessfulReads(prisma, getSalesRevenueSummary);

    const summary = await getHomePerformanceSummary('biz-nairobi', BOUNDARY);
    expect(summary.timeZone).toBe('Africa/Nairobi');
    expect(summary.todayScope.fromInputValue).toBe('2026-07-01');
    expect(summary.todayScope.toInputValue).toBe('2026-07-01');
    expect(getSalesRevenueSummary).toHaveBeenCalledWith(
      expect.objectContaining({ timeZone: 'Africa/Nairobi' }),
    );
  });

  it.each([null, '', '   ', 'Mars/Olympus'] as const)('rejects stored timezone %s before sales queries', async (timezone) => {
    const { prisma, getSalesRevenueSummary, getHomePerformanceSummary } = await load();
    vi.mocked(prisma.business.findUnique).mockResolvedValue({ timezone } as never);
    stubSuccessfulReads(prisma, getSalesRevenueSummary);

    let error: unknown;
    let timeZone: string | null = null;
    try {
      timeZone = (await getHomePerformanceSummary('biz-bad', BOUNDARY)).timeZone;
    } catch (caught) {
      error = caught;
    }

    expect({
      message: error instanceof Error ? error.message : null,
      timeZone,
      queriedSales: vi.mocked(getSalesRevenueSummary).mock.calls.length,
    }).toEqual({
      message: REQUIRED,
      timeZone: null,
      queriedSales: 0,
    });
  });
});
