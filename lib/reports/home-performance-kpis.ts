/**
 * Slim Owner Home performance summary — sales revenue, transactions, expected cash,
 * yesterday comparison, product count. Does NOT load Command Center payloads.
 *
 * Today sales revenue uses the shared sales-revenue contract (RETURNED/VOID excluded).
 * Period bounds use the business timezone (inclusive start / exclusive end).
 * Expected cash uses open-shift sum semantics via resolveReadinessExpectedCashPence.
 */
import { prisma } from '@/lib/prisma';
import { resolveReadinessExpectedCashPence } from '@/lib/reports/home-expected-cash';
import { measureHomePerf } from '@/lib/performance/home-perf-instrumentation';
import { assertHomeLoaderAllowed } from '@/lib/owner-home/force-fail';
import {
  getBusinessDayBounds,
  resolveBusinessTimeZone,
} from '@/lib/notifications/utils';
import {
  resolveReportingScope,
  tradingReportHref,
  type ReportingScope,
} from '@/lib/reports/reporting-scope';
import { getSalesRevenueSummary } from '@/lib/reports/sales-revenue';
import { REPORTING_EXCLUDED_SALE_STATUSES } from '@/lib/reports/reporting-scope';

export type HomePerformanceSummary = {
  todayRevenuePence: number;
  todayTransactionCount: number;
  yesterdayRevenuePence: number;
  yesterdayTransactionCount: number;
  expectedCashPence: number;
  openShiftCount: number;
  productCount: number;
  timeZone: string;
  todayScope: Pick<ReportingScope, 'periodKey' | 'fromInputValue' | 'toInputValue' | 'storeId'>;
  tradingReportHref: string;
};

async function loadBusinessTimeZone(businessId: string): Promise<string> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  });
  return resolveBusinessTimeZone(business?.timezone);
}

export async function getHomePerformanceSummary(
  businessId: string,
  now = new Date(),
): Promise<HomePerformanceSummary> {
  return measureHomePerf('home.performance-summary', async () => {
    assertHomeLoaderAllowed('performance');

    const timeZone = await loadBusinessTimeZone(businessId);
    const todayScope = resolveReportingScope({
      businessId,
      timeZone,
      params: { period: 'today', storeId: 'ALL' },
      defaultPeriod: 'today',
      allowedStoreIds: [],
      now,
    });

    const yesterdayProbe = new Date(todayScope.startInclusive.getTime() - 1);
    const yesterdayDay = getBusinessDayBounds(yesterdayProbe, timeZone);
    const yesterdayKey = [
      yesterdayDay.localDate.year,
      String(yesterdayDay.localDate.month).padStart(2, '0'),
      String(yesterdayDay.localDate.day).padStart(2, '0'),
    ].join('-');
    const yesterdayScope = resolveReportingScope({
      businessId,
      timeZone,
      params: {
        period: 'custom',
        from: yesterdayKey,
        to: yesterdayKey,
        storeId: 'ALL',
      },
      defaultPeriod: 'today',
      allowedStoreIds: [],
      now: yesterdayProbe,
    });

    // Yesterday historically also excluded DEMO_DAY tags (getReadiness parity).
    const [todaySummary, yesterdayAgg, openShifts, productCount] = await Promise.all([
      getSalesRevenueSummary(todayScope),
      prisma.salesInvoice.aggregate({
        where: {
          businessId,
          createdAt: {
            gte: yesterdayScope.startInclusive,
            lt: yesterdayScope.endExclusive,
          },
          paymentStatus: { notIn: [...REPORTING_EXCLUDED_SALE_STATUSES] },
          OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }],
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

    const hrefScope = {
      periodKey: todayScope.periodKey,
      fromInputValue: todayScope.fromInputValue,
      toInputValue: todayScope.toInputValue,
      storeId: todayScope.storeId,
    };

    return {
      todayRevenuePence: todaySummary.salesRevenuePence,
      todayTransactionCount: todaySummary.transactionCount,
      yesterdayRevenuePence: yesterdayAgg._sum.totalPence ?? 0,
      yesterdayTransactionCount: yesterdayAgg._count.id,
      expectedCashPence,
      openShiftCount: openShifts.length,
      productCount,
      timeZone,
      todayScope: hrefScope,
      tradingReportHref: tradingReportHref(hrefScope),
    };
  });
}
