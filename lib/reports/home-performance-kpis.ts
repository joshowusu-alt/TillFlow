/**
 * Slim Owner Home performance summary — revenue, transactions, expected cash,
 * yesterday comparison, product count. Does NOT load Command Center payloads.
 *
 * Today revenue/tx match getTodayKPIs (RETURNED/VOID excluded; DEMO_DAY not filtered).
 * Yesterday matches historical getReadiness aggregate (also excludes DEMO_DAY).
 * Expected cash uses open-shift sum semantics via resolveReadinessExpectedCashPence.
 */
import { prisma } from '@/lib/prisma';
import {
  ensureSqliteReportDateColumnsNormalized,
  isDateWithinRange,
  isSqliteRuntime,
} from '@/lib/reports/sqlite-report-date-normalization';
import { resolveReadinessExpectedCashPence } from '@/lib/reports/home-expected-cash';
import { measureHomePerf } from '@/lib/performance/home-perf-instrumentation';
import { assertHomeLoaderAllowed } from '@/lib/owner-home/force-fail';

export type HomePerformanceSummary = {
  todayRevenuePence: number;
  todayTransactionCount: number;
  yesterdayRevenuePence: number;
  yesterdayTransactionCount: number;
  expectedCashPence: number;
  openShiftCount: number;
  productCount: number;
};

function dayBounds(now: Date) {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const yesterdayEnd = new Date(todayEnd);
  yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
  return { todayStart, todayEnd, yesterdayStart, yesterdayEnd };
}

/** Match getTodayKPIs today sales filter. */
const TODAY_SALE_WHERE = {
  paymentStatus: { notIn: ['RETURNED', 'VOID'] as ('RETURNED' | 'VOID')[] },
};

/** Match getReadiness yesterday aggregate. */
const YESTERDAY_SALE_WHERE = {
  paymentStatus: { notIn: ['RETURNED', 'VOID'] as ('RETURNED' | 'VOID')[] },
  OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }],
};

async function getHomePerformanceSummarySqlite(
  businessId: string,
  now: Date
): Promise<HomePerformanceSummary> {
  const { todayStart, todayEnd, yesterdayStart, yesterdayEnd } = dayBounds(now);

  const [salesRows, openShifts, productCount] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: {
        businessId,
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        createdAt: { gte: yesterdayStart, lte: todayEnd },
      },
      select: { totalPence: true, createdAt: true, paymentStatus: true, qaTag: true },
    }),
    prisma.shift.findMany({
      where: {
        status: 'OPEN',
        closedAt: null,
        till: { store: { businessId } },
      },
      select: { expectedCashPence: true },
    }),
    prisma.product.count({ where: { businessId } }),
  ]);

  const todayRows = salesRows.filter((row) =>
    isDateWithinRange(row.createdAt, todayStart, todayEnd)
  );
  const yesterdayRows = salesRows.filter(
    (row) =>
      isDateWithinRange(row.createdAt, yesterdayStart, yesterdayEnd) &&
      (row.qaTag == null || row.qaTag !== 'DEMO_DAY')
  );

  const expectedCashPence = await resolveReadinessExpectedCashPence({
    openShiftExpectedCashPence: openShifts.map((s) => s.expectedCashPence),
  });

  return {
    todayRevenuePence: todayRows.reduce((s, r) => s + r.totalPence, 0),
    todayTransactionCount: todayRows.length,
    yesterdayRevenuePence: yesterdayRows.reduce((s, r) => s + r.totalPence, 0),
    yesterdayTransactionCount: yesterdayRows.length,
    expectedCashPence,
    openShiftCount: openShifts.length,
    productCount,
  };
}

async function getHomePerformanceSummaryPostgres(
  businessId: string,
  now: Date
): Promise<HomePerformanceSummary> {
  const { todayStart, todayEnd, yesterdayStart, yesterdayEnd } = dayBounds(now);

  const [todayAgg, yesterdayAgg, openShifts, productCount] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: {
        businessId,
        createdAt: { gte: todayStart, lte: todayEnd },
        ...TODAY_SALE_WHERE,
      },
      _sum: { totalPence: true },
      _count: { id: true },
    }),
    prisma.salesInvoice.aggregate({
      where: {
        businessId,
        createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
        ...YESTERDAY_SALE_WHERE,
      },
      _sum: { totalPence: true },
      _count: { id: true },
    }),
    prisma.shift.findMany({
      where: {
        status: 'OPEN',
        closedAt: null,
        till: { store: { businessId } },
      },
      select: { expectedCashPence: true },
    }),
    prisma.product.count({ where: { businessId } }),
  ]);

  const expectedCashPence = await resolveReadinessExpectedCashPence({
    openShiftExpectedCashPence: openShifts.map((s) => s.expectedCashPence),
  });

  return {
    todayRevenuePence: todayAgg._sum.totalPence ?? 0,
    todayTransactionCount: todayAgg._count.id,
    yesterdayRevenuePence: yesterdayAgg._sum.totalPence ?? 0,
    yesterdayTransactionCount: yesterdayAgg._count.id,
    expectedCashPence,
    openShiftCount: openShifts.length,
    productCount,
  };
}

export async function getHomePerformanceSummary(
  businessId: string
): Promise<HomePerformanceSummary> {
  return measureHomePerf('home.performance-summary', async () => {
    assertHomeLoaderAllowed('performance');
    try {
      await ensureSqliteReportDateColumnsNormalized();
    } catch {
      // Same resilience as getTodayKPIs — continue with best-effort dates.
    }
    const now = new Date();
    if (isSqliteRuntime()) {
      return getHomePerformanceSummarySqlite(businessId, now);
    }
    return getHomePerformanceSummaryPostgres(businessId, now);
  });
}
