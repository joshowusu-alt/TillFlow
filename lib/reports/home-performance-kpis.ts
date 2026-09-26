/**
 * Slim Owner Home performance summary — sales revenue, transactions, expected cash,
 * yesterday comparison, product count. Does NOT load Command Center payloads.
 *
 * Today sales revenue uses the shared sales-revenue contract (RETURNED/VOID excluded).
 * Period bounds use the business timezone (inclusive start / exclusive end).
 * Expected cash uses open-shift sum semantics via resolveReadinessExpectedCashPence.
 */
import { prisma } from '@/lib/prisma';
import { expectedCashPenceFromEntries } from '@/lib/reports/expected-cash';
import { resolveReadinessExpectedCashPence } from '@/lib/reports/home-expected-cash';
import { measureHomePerf } from '@/lib/performance/home-perf-instrumentation';
import { assertHomeLoaderAllowed } from '@/lib/owner-home/force-fail';
import { getBusinessDayBounds } from '@/lib/notifications/utils';
import { requireReportTimeZone } from '@/lib/reports/reporting-clock';
import {
  resolveReportingScope,
  tradingReportHref,
  type ReportingScope,
} from '@/lib/reports/reporting-scope';
import { getSalesRevenueSummary } from '@/lib/reports/sales-revenue';
import { REPORTING_EXCLUDED_SALE_STATUSES } from '@/lib/reports/reporting-scope';
import { mapOpenShiftTills, type OpenShiftTillIdentity } from '@/lib/home-attention-presentation';

export type HomePerformanceSummary = {
  todayRevenuePence: number;
  todayTransactionCount: number;
  yesterdayRevenuePence: number;
  yesterdayTransactionCount: number;
  expectedCashPence: number | null;
  openShiftCount: number;
  openShiftTills: OpenShiftTillIdentity[];
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
  return requireReportTimeZone(business?.timezone);
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
        select: {
          id: true,
          tillId: true,
          till: { select: { storeId: true, name: true, store: { select: { name: true } } } },
          cashDrawerEntries: {
            select: {
              entryType: true,
              amountPence: true,
              businessId: true,
              storeId: true,
              tillId: true,
              shiftId: true,
            },
          },
        },
      }),
      prisma.product.count({ where: { businessId } }),
    ]);

    const expectedCashPence = await resolveReadinessExpectedCashPence({
      openShifts: openShifts.map((shift) => ({
        businessId,
        storeId: shift.till.storeId,
        tillId: shift.tillId,
        shiftId: shift.id,
        entries: shift.cashDrawerEntries,
      })),
    });
    if (
      expectedCashPence !== null &&
      expectedCashPence !==
        openShifts.reduce(
          (sum, shift) =>
            sum +
            expectedCashPenceFromEntries(shift.cashDrawerEntries, {
              businessId,
              storeId: shift.till.storeId,
              tillId: shift.tillId,
              shiftId: shift.id,
            }),
          0,
        )
    ) {
      throw new Error('Home expected cash diverged from drawer entries');
    }

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
      openShiftTills: mapOpenShiftTills(openShifts),
      productCount,
      timeZone,
      todayScope: hrefScope,
      tradingReportHref: tradingReportHref(hrefScope),
    };
  });
}
