/**
 * Owner Home critical shell — identity + Open POS without waiting on KPIs/IYR.
 */
import { requireBusiness } from '@/lib/auth';
import { getBusinessPlan, type BusinessPlan } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import { measureHomePerf } from '@/lib/performance/home-perf-instrumentation';
import { computeOnboardingJourney } from '@/lib/onboarding-journey';

export type OwnerHomeCriticalShell = {
  businessId: string;
  businessName: string;
  userName: string;
  currency: string;
  plan: BusinessPlan;
  onboardingComplete: boolean;
  onboardingCompletedAt: Date | null;
  saleCount: number;
  guidedSetup: boolean;
  /** True when incomplete journey still needs full getReadiness. */
  needsFullReadiness: boolean;
};

export async function getOwnerHomeCriticalShell(): Promise<OwnerHomeCriticalShell> {
  return measureHomePerf('home.critical-shell', async () => {
    const { user, business } = await requireBusiness(['OWNER']);

    const [saleCount, productCounts] = await Promise.all([
      prisma.salesInvoice.count({
        where: {
          businessId: business.id,
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
          OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }],
        },
      }),
      // Minimal counts for journey gate — cheap vs full activation snapshot.
      Promise.all([
        prisma.product.count({ where: { businessId: business.id } }),
        prisma.product.count({
          where: { businessId: business.id, active: true, sellingPriceBasePence: { gt: 0 } },
        }),
        prisma.product.count({
          where: {
            businessId: business.id,
            active: true,
            sellingPriceBasePence: { gt: 0 },
            inventoryBalances: { some: { qtyOnHandBase: { gt: 0 } } },
          },
        }),
      ]),
    ]);

    const [productCount, validProductCount, sellableProductCount] = productCounts;

    const journey = computeOnboardingJourney({
      name: business.name,
      businessCategory: (business as { businessCategory?: string | null }).businessCategory ?? null,
      validProductCount,
      sellableProductCount,
      productCount,
      saleCount,
      onboardingCompletedAt: business.onboardingCompletedAt,
    });

    return {
      businessId: business.id,
      businessName: business.name,
      userName: user.name,
      currency: business.currency,
      plan: getBusinessPlan(
        business.plan,
        business.storeMode === 'MULTI_STORE' || business.storeMode === 'SINGLE_STORE'
          ? business.storeMode
          : null,
      ),
      onboardingComplete: journey.onboardingComplete,
      onboardingCompletedAt: business.onboardingCompletedAt ?? null,
      saleCount,
      guidedSetup: business.guidedSetup,
      needsFullReadiness: !journey.onboardingComplete,
    };
  });
}
