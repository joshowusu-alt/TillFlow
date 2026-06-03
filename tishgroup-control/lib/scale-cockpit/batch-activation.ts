import { prisma } from '@/lib/prisma';
import {
  computeActivationReadiness,
  type ActivationBusinessSnapshot,
  type ActivationReadinessResult,
} from '@/lib/vendor/activation-readiness';
import type { SubscriptionInput } from '@/lib/vendor/subscription-lifecycle';

const demoSaleExclusion = {
  OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }],
};

export type BatchActivationRow = {
  businessId: string;
  readiness: ActivationReadinessResult;
  snapshot: ActivationBusinessSnapshot;
};

function sevenDaysAgo(now: Date) {
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

export async function loadBatchActivationReadiness(now = new Date()): Promise<BatchActivationRow[]> {
  const since7d = sevenDaysAgo(now);

  const businesses = await prisma.business.findMany({
    where: { isDemo: false },
    orderBy: { createdAt: 'desc' },
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
      activationStatus: true,
      setupProgressPct: true,
      activationStuckReason: true,
      activationNextAction: true,
      activationSnapshotAt: true,
      storefrontEnabled: true,
      users: {
        where: { role: 'OWNER' },
        take: 1,
        select: { name: true, email: true, lastLoginAt: true },
      },
      stores: { select: { id: true } },
      _count: {
        select: {
          products: true,
          users: true,
          purchaseInvoices: true,
          salesInvoices: {
            where: {
              paymentStatus: { notIn: ['RETURNED', 'VOID'] },
              ...demoSaleExclusion,
            },
          },
        },
      },
    },
  });

  const businessIds = businesses.map((b) => b.id);
  if (businessIds.length === 0) return [];

  const [salesLast7d, lastSales, profiles] = await Promise.all([
    prisma.salesInvoice.groupBy({
      by: ['businessId'],
      where: {
        businessId: { in: businessIds },
        createdAt: { gte: since7d },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        ...demoSaleExclusion,
      },
      _count: { id: true },
    }),
    prisma.salesInvoice.findMany({
      where: {
        businessId: { in: businessIds },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        ...demoSaleExclusion,
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['businessId'],
      select: { businessId: true, createdAt: true },
    }),
    prisma.controlBusinessProfile.findMany({
      where: { businessId: { in: businessIds } },
      select: {
        businessId: true,
        ownerName: true,
        ownerPhone: true,
        ownerEmail: true,
        assignedAgentName: true,
        assignedManager: { select: { name: true } },
        referralSource: true,
        referredBy: true,
        referredByName: true,
        referredByPhone: true,
        sourceChannel: true,
        referralStatus: true,
        referralNextFollowUpAt: true,
        referralNotes: true,
        supportStatus: true,
        openSupportIssueCount: true,
        onboardingStage: true,
        lastSaleAt: true,
        productCountSnapshot: true,
        transactionCountSnapshot: true,
      },
    }),
  ]);

  const sales7dMap = new Map(salesLast7d.map((r) => [r.businessId, r._count.id]));
  const lastSaleMap = new Map(lastSales.map((r) => [r.businessId, r.createdAt]));
  const profileMap = new Map(profiles.map((p) => [p.businessId, p]));
  return businesses.map((business) => {
    const profile = profileMap.get(business.id);
    const owner = business.users[0];
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

    const snapshot: ActivationBusinessSnapshot = {
      businessId: business.id,
      isDemo: business.isDemo,
      createdAt: business.createdAt,
      name: business.name,
      address: business.address,
      phone: profile?.ownerPhone ?? business.phone,
      businessCategory: business.businessCategory,
      selectedPlan: business.selectedPlan,
      momoEnabled: business.momoEnabled,
      momoNumber: business.momoNumber,
      openingCapitalPence: business.openingCapitalPence,
      onboardingCompletedAt: business.onboardingCompletedAt,
      ownerLastDashboardViewAt: business.ownerLastDashboardViewAt,
      ownerLastReportViewAt: business.ownerLastReportViewAt,
      trialAcknowledgedAt: business.trialAcknowledgedAt,
      productCount: business._count.products,
      inventoryOnHandBase: 0,
      staffCount: business._count.users,
      purchaseCount: business._count.purchaseInvoices,
      saleCount: business._count.salesInvoices,
      salesLast7Days: sales7dMap.get(business.id) ?? 0,
      lastSaleAt: lastSaleMap.get(business.id) ?? profile?.lastSaleAt ?? null,
      openSupportIssueCount: 0,
      hasCriticalSupportIssue: false,
      ownerLastLoginAt: owner?.lastLoginAt ?? null,
      subscription,
      now,
    };

    const readiness = computeActivationReadiness(snapshot);

    return { businessId: business.id, readiness, snapshot };
  });
}
