/**
 * Deferred Owner Home attention payload.
 * Open-shift / supplier queries are light; Command Center count reuses getTodayKPIs
 * issue flags via shared countCommandCenterIssueFlags (same eligibility as CC page).
 */
import { prisma } from '@/lib/prisma';
import { getTodayKPIs } from '@/lib/reports/today-kpis';
import { countCommandCenterIssueFlags } from '@/lib/reports/home-issue-count';
import { measureHomePerf } from '@/lib/performance/home-perf-instrumentation';
import { assertHomeLoaderAllowed } from '@/lib/owner-home/force-fail';

export type OwnerHomeAttentionData = {
  openShiftCount: number;
  openShiftSalesCount: number;
  openShiftOpenedAt: string | null;
  openIssueCount: number;
  reorderNeededCount: number;
  overdueSupplierInvoiceCount: number;
};

const DEMO_SALE_EXCLUSION = {
  OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }],
};

export async function getOwnerHomeAttentionData(
  businessId: string
): Promise<OwnerHomeAttentionData> {
  return measureHomePerf('home.attention', async () => {
    assertHomeLoaderAllowed('attention');
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [openShifts, overdueSupplierInvoiceCount, todayKpis] = await Promise.all([
      prisma.shift.findMany({
        where: {
          status: 'OPEN',
          closedAt: null,
          till: { store: { businessId } },
        },
        select: {
          openedAt: true,
          _count: {
            select: {
              salesInvoices: {
                where: {
                  paymentStatus: { notIn: ['RETURNED', 'VOID'] },
                  ...DEMO_SALE_EXCLUSION,
                },
              },
            },
          },
        },
      }),
      prisma.purchaseInvoice.count({
        where: {
          businessId,
          paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
          dueDate: { lt: todayStart },
        },
      }),
      // Deferred — not on useful-Home critical path. Same source as Command Center.
      getTodayKPIs(businessId).catch(() => null),
    ]);

    return {
      openShiftCount: openShifts.length,
      openShiftSalesCount: openShifts.reduce((sum, shift) => sum + shift._count.salesInvoices, 0),
      openShiftOpenedAt: openShifts.length
        ? openShifts
            .map((shift) => shift.openedAt)
            .sort((a, b) => a.getTime() - b.getTime())[0]
            ?.toISOString() ?? null
        : null,
      openIssueCount: todayKpis ? countCommandCenterIssueFlags(todayKpis) : 0,
      reorderNeededCount: todayKpis?.urgentReorderCount ?? 0,
      overdueSupplierInvoiceCount,
    };
  });
}
