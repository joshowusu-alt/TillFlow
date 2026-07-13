import { prisma } from '@/lib/prisma';
import {
  computeActivationReadiness,
  type ActivationBusinessSnapshot,
  type ActivationReadinessResult,
} from '@/lib/activation-readiness';
import type { SubscriptionInput } from '@/lib/subscription-lifecycle';
import { revalidateTag } from 'next/cache';

const demoSaleExclusion = {
  OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }],
};

function sevenDaysAgo(now: Date) {
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

export async function loadActivationSnapshot(
  businessId: string,
  now = new Date()
): Promise<ActivationBusinessSnapshot | null> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      isDemo: true,
      createdAt: true,
      name: true,
      address: true,
      phone: true,
      businessCategory: true,
      selectedPlan: true,
      plan: true,
      momoEnabled: true,
      momoNumber: true,
      openingCapitalPence: true,
      onboardingCompletedAt: true,
      ownerLastDashboardViewAt: true,
      ownerLastReportViewAt: true,
      trialAcknowledgedAt: true,
      trialStartedAt: true,
      trialEndsAt: true,
      subscriptionStatus: true,
      planStatus: true,
      firstPaymentAt: true,
      currentPeriodEndsAt: true,
      nextBillingDate: true,
      nextPaymentDueAt: true,
      paymentGraceEndsAt: true,
      suspendedAt: true,
      cancelledAt: true,
      billingInterval: true,
      timezone: true,
      users: {
        where: { role: 'OWNER', active: true },
        take: 1,
        select: { lastLoginAt: true },
      },
    },
  });

  if (!business) return null;

  const since7d = sevenDaysAgo(now);

  const [
    productCount,
    validProductCount,
    sellableProductCount,
    inventoryOnHandAgg,
    staffCount,
    purchaseCount,
    saleCount,
    salesLast7Days,
    lastSale,
  ] =
    await Promise.all([
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
      prisma.inventoryBalance.aggregate({
        where: { product: { businessId } },
        _sum: { qtyOnHandBase: true },
      }),
      prisma.user.count({ where: { businessId, active: true } }),
      prisma.purchaseInvoice.count({ where: { businessId } }),
      prisma.salesInvoice.count({
        where: {
          businessId,
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
          ...demoSaleExclusion,
        },
      }),
      prisma.salesInvoice.count({
        where: {
          businessId,
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
          createdAt: { gte: since7d },
          ...demoSaleExclusion,
        },
      }),
      prisma.salesInvoice.findFirst({
        where: {
          businessId,
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
          ...demoSaleExclusion,
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

  const subscription: SubscriptionInput = {
    selectedPlan: business.selectedPlan ?? business.plan,
    plan: business.plan,
    subscriptionStatus: business.subscriptionStatus,
    planStatus: business.planStatus,
    trialStartedAt: business.trialStartedAt,
    trialEndsAt: business.trialEndsAt,
    firstPaymentAt: business.firstPaymentAt,
    currentPeriodEndsAt: business.currentPeriodEndsAt,
    nextBillingDate: business.nextBillingDate,
    nextPaymentDueAt: business.nextPaymentDueAt,
    paymentGraceEndsAt: business.paymentGraceEndsAt,
    suspendedAt: business.suspendedAt,
    cancelledAt: business.cancelledAt,
    billingInterval: business.billingInterval,
    timezone: business.timezone,
  };

  const { loadBusinessSupportStats } = await import('@/lib/support-issue-stats');
  const supportStats = await loadBusinessSupportStats(businessId, now);

  return {
    businessId: business.id,
    isDemo: business.isDemo,
    createdAt: business.createdAt,
    name: business.name,
    address: business.address,
    phone: business.phone,
    businessCategory: business.businessCategory,
    selectedPlan: business.selectedPlan,
    momoEnabled: business.momoEnabled,
    momoNumber: business.momoNumber,
    openingCapitalPence: business.openingCapitalPence,
    onboardingCompletedAt: business.onboardingCompletedAt,
    ownerLastDashboardViewAt: business.ownerLastDashboardViewAt,
    ownerLastReportViewAt: business.ownerLastReportViewAt,
    trialAcknowledgedAt: business.trialAcknowledgedAt,
    productCount,
    validProductCount,
    sellableProductCount,
    inventoryOnHandBase: inventoryOnHandAgg._sum.qtyOnHandBase ?? 0,
    staffCount,
    purchaseCount,
    saleCount,
    salesLast7Days,
    lastSaleAt: lastSale?.createdAt ?? null,
    openSupportIssueCount: supportStats.openSupportIssueCount,
    hasCriticalSupportIssue: supportStats.hasCriticalSupportIssue,
    ownerLastLoginAt: business.users[0]?.lastLoginAt ?? null,
    subscription,
    now,
  };
}

export async function computeActivationForBusiness(
  businessId: string,
  now = new Date()
): Promise<ActivationReadinessResult | null> {
  const snapshot = await loadActivationSnapshot(businessId, now);
  if (!snapshot) return null;
  return computeActivationReadiness(snapshot);
}

export async function persistActivationSnapshot(
  businessId: string,
  now = new Date()
): Promise<ActivationReadinessResult | null> {
  const readiness = await computeActivationForBusiness(businessId, now);
  if (!readiness) return null;

  const snapshot = await loadActivationSnapshot(businessId, now);
  if (!snapshot) return readiness;

  await prisma.business.update({
    where: { id: businessId },
    data: {
      activationStatus: readiness.activationStatus,
      setupProgressPct: readiness.setupProgressPercent,
      activationStuckReason: readiness.stuckReason,
      activationNextAction: readiness.nextAction,
      activationSnapshotAt: now,
    },
  });

  try {
    await prisma.controlBusinessProfile.upsert({
      where: { businessId },
      update: {
        onboardingStage: readiness.onboardingStage,
        stuckReason: readiness.stuckReason,
        activationScore: readiness.setupProgressPercent,
        nextRecommendedAction: readiness.nextAction,
        churnRisk: readiness.churnRisk,
        productCountSnapshot: snapshot.productCount,
        transactionCountSnapshot: snapshot.saleCount,
        lastSaleAt: snapshot.lastSaleAt,
        lastActivityAt: snapshot.lastSaleAt ?? undefined,
      },
      create: {
        businessId,
        onboardingStage: readiness.onboardingStage,
        stuckReason: readiness.stuckReason,
        activationScore: readiness.setupProgressPercent,
        nextRecommendedAction: readiness.nextAction,
        churnRisk: readiness.churnRisk,
        productCountSnapshot: snapshot.productCount,
        transactionCountSnapshot: snapshot.saleCount,
        lastSaleAt: snapshot.lastSaleAt,
        lastActivityAt: snapshot.lastSaleAt,
        supportStatus: 'UNREVIEWED',
      },
    });
  } catch {
    // Control plane tables may be missing in some dev DBs
  }

  return readiness;
}

/** Safe from Server Actions / route handlers only — not during RSC render. */
export function revalidateActivationCaches(businessId: string) {
  revalidateTag('control-portfolio');
  revalidateTag(`readiness-${businessId}`);
}

export type ActivationSnapshotBatchResult = {
  processed: number;
  errors: number;
};

export async function refreshAllActivationSnapshots(
  now = new Date()
): Promise<ActivationSnapshotBatchResult> {
  const businesses = await prisma.business.findMany({
    where: { isDemo: false },
    select: { id: true },
  });

  let errors = 0;
  for (const { id } of businesses) {
    try {
      await persistActivationSnapshot(id, now);
    } catch {
      errors += 1;
    }
  }

  return { processed: businesses.length, errors };
}
