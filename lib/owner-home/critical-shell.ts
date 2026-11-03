/**
 * Owner Home critical shell — identity + Open POS without waiting on KPIs/IYR.
 */
import { cache } from 'react';
import { requireBusiness } from '@/lib/auth';
import { getBusinessPlan, type BusinessPlan } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import { measureHomePerf } from '@/lib/performance/home-perf-instrumentation';

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

export const getOwnerHomeCriticalShell = cache(async (): Promise<OwnerHomeCriticalShell> => {
  return measureHomePerf('home.critical-shell', async () => {
    const { user, business } = await requireBusiness(['OWNER']);

    const saleCount = await prisma.salesInvoice.count({
        where: {
          businessId: business.id,
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
          OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }],
        },
    });
    // Product/stock readiness only matters inside the incomplete checklist.
    // It cannot change whether an existing sale/completion opens established Home.
    const onboardingComplete = saleCount > 0 || Boolean(business.onboardingCompletedAt);

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
      onboardingComplete,
      onboardingCompletedAt: business.onboardingCompletedAt ?? null,
      saleCount,
      guidedSetup: business.guidedSetup,
      needsFullReadiness: !onboardingComplete,
    };
  });
});
