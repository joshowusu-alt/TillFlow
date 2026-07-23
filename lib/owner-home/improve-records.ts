/**
 * Deferred Improve Your Records loader for completed Owner Home.
 * Recommendation engine unchanged — only timing/placement changes.
 */
import { prisma } from '@/lib/prisma';
import { loadImproveRecordsResult } from '@/lib/improve-records-load';
import type { ImproveRecordsResult } from '@/lib/improve-records';
import { measureHomePerf } from '@/lib/performance/home-perf-instrumentation';
import { assertHomeLoaderAllowed } from '@/lib/owner-home/force-fail';

export async function getOwnerHomeImproveRecords(
  businessId: string,
  saleCount: number
): Promise<ImproveRecordsResult> {
  return measureHomePerf('home.improve-records', async () => {
    assertHomeLoaderAllowed('iyr');
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        plan: true,
        storeMode: true,
        momoEnabled: true,
        momoNumber: true,
        momoProvider: true,
        onboardingCompletedAt: true,
      },
    });

    const [productCount, validProductCount, sellableProductCount, staffCount] = await Promise.all([
      prisma.product.count({ where: { businessId } }),
      prisma.product.count({
        where: { businessId, active: true, sellingPriceBasePence: { gt: 0 } },
      }),
      prisma.product.count({
        where: {
          businessId,
          active: true,
          sellingPriceBasePence: { gt: 0 },
          inventoryBalances: { some: { qtyOnHandBase: { gt: 0 } } },
        },
      }),
      prisma.user.count({ where: { businessId, active: true } }),
    ]);

    return loadImproveRecordsResult({
      businessId,
      onboardingComplete: Boolean(business.onboardingCompletedAt) || saleCount > 0,
      saleCount,
      productCount,
      validProductCount,
      sellableProductCount,
      staffCount,
      momoEnabled: Boolean(business.momoEnabled),
      momoNumber: business.momoNumber ?? null,
      momoProvider: business.momoProvider ?? null,
      planOrMode: business.plan ?? null,
      storeMode: business.storeMode ?? null,
      role: 'OWNER',
    });
  });
}
