/**
 * Secondary Owner Home extras — last close, last receipt, demo/seed flags.
 * Not on the useful-Home critical path.
 */
import { prisma } from '@/lib/prisma';
import { DEMO_SKUS } from '@/lib/demo-data-constants';
import { measureHomePerf } from '@/lib/performance/home-perf-instrumentation';
import { assertHomeLoaderAllowed } from '@/lib/owner-home/force-fail';

export type OwnerHomeExtrasData = {
  lastShiftClosedAt: string | null;
  lastReceiptId: string | null;
  hasDemoData: boolean;
  hasSeedData: boolean;
};

export async function getOwnerHomeExtrasData(
  businessId: string,
  hasDemoData: boolean
): Promise<OwnerHomeExtrasData> {
  return measureHomePerf('home.extras', async () => {
    assertHomeLoaderAllowed('extras');
    const [lastClosedShift, lastReceipt, seedProductCount] = await Promise.all([
      prisma.shift.findFirst({
        where: {
          till: { store: { businessId } },
          closedAt: { not: null },
        },
        orderBy: { closedAt: 'desc' },
        select: { closedAt: true },
      }),
      prisma.salesInvoice.findFirst({
        where: {
          businessId,
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
          OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }],
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      }),
      prisma.product.count({ where: { businessId, sku: { in: DEMO_SKUS } } }),
    ]);

    return {
      lastShiftClosedAt: lastClosedShift?.closedAt?.toISOString() ?? null,
      lastReceiptId: lastReceipt?.id ?? null,
      hasDemoData,
      hasSeedData: seedProductCount > 0,
    };
  });
}
