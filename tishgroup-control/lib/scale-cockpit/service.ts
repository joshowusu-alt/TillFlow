import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { planRates } from '@/lib/control-data';
import { computeBillingAccessState } from '@/lib/vendor/subscription-lifecycle';
import { mapIssueRow } from '@/lib/support-issues/service';
import { loadSupportStatsByBusinessIds } from '@/lib/support-issues/sync';
import { computePortfolioHealth } from '@/lib/business-health';
import { loadBatchActivationReadiness } from './batch-activation';
import { OPEN_SUPPORT_STATUSES, type SupportIssueRow } from '@/lib/support-issues/types';
import {
  formatBusinessType,
  formatIsoDate,
  getActivationStatusLabel,
  getOnboardingStageLabel,
  getStuckReasonMessage,
  matchesScaleFilter,
  PIPELINE_STAGE_ORDER,
} from './labels';
import type {
  ScaleActionItem,
  ScaleBusinessRecord,
  ScaleCockpitData,
  ScaleHealthLabel,
  ScalePipelineStage,
} from './types';

const RESTRICTED_STATES = new Set([
  'TRIAL_RESTRICTED',
  'PAYMENT_RESTRICTED',
  'READ_ONLY',
  'CANCELLED',
]);

const OVERDUE_STATES = new Set([
  'TRIAL_EXPIRED_GRACE',
  'PAYMENT_OVERDUE_GRACE',
  'TRIAL_RESTRICTED',
  'PAYMENT_RESTRICTED',
]);

const TRIAL_STATES = new Set([
  'TRIAL_ACTIVE',
  'TRIAL_DUE_SOON',
  'TRIAL_DUE_TODAY',
  'TRIAL_EXPIRED_GRACE',
  'TRIAL_RESTRICTED',
]);

function resolveHealthLabel(
  record: Omit<ScaleBusinessRecord, 'healthLabel' | 'portfolioHealth' | 'portfolioHealthReasons'>
): ScaleHealthLabel {
  if (record.hasCriticalSupportIssue || record.highestSupportPriority === 'CRITICAL') {
    return 'Support risk';
  }
  if (record.hasStaleSupportIssue || record.repeatSupportIssues) return 'Support risk';
  if (record.openSupportIssueCount > 0) return 'Support risk';
  if (OVERDUE_STATES.has(record.billingAccessState) || RESTRICTED_STATES.has(record.billingAccessState)) {
    return 'Payment risk';
  }
  if (record.churnRisk) return 'Churn risk';
  if (record.activationStatus === 'STUCK' || record.stuckReason) return 'Needs setup help';
  if (record.saleCount > 0 && record.salesLast7Days < 5) return 'Low usage';
  if (record.isHealthy) return 'Healthy';
  if (record.activationStatus === 'SETUP_IN_PROGRESS' || record.activationStatus === 'GETTING_STARTED') {
    return 'Needs setup help';
  }
  return 'Low usage';
}

function buildActionItems(records: ScaleBusinessRecord[], now: Date): ScaleActionItem[] {
  const items: ScaleActionItem[] = [];
  const dayMs = 24 * 60 * 60 * 1000;

  for (const record of records) {
    const push = (reason: string, category: string, priority: ScaleActionItem['priority']) => {
      items.push({
        businessId: record.businessId,
        businessName: record.businessName,
        ownerName: record.ownerName,
        ownerPhone: record.ownerPhone,
        reason,
        nextAction: record.nextAction,
        assignedAgent: record.assignedAgent,
        priority,
        category,
      });
    };

    if (record.hasCriticalSupportIssue) {
      push(`Critical support issue open`, 'support', 'critical');
    } else if (record.highestSupportPriority === 'HIGH' && record.openSupportIssueCount > 0) {
      push('High-priority support issue open', 'support', 'high');
    } else if (record.hasStaleSupportIssue) {
      push('Support issue not updated in 24+ hours', 'support', 'high');
    }

    if (record.billingAccessState === 'TRIAL_DUE_TODAY' || record.billingAccessState === 'PAYMENT_DUE_TODAY') {
      push('Trial or payment due today', 'billing', 'critical');
    } else if (record.billingAccessState === 'TRIAL_DUE_SOON' || record.billingAccessState === 'RENEWAL_DUE_SOON') {
      push('Trial or renewal ending within 3 days', 'billing', 'high');
    } else if (OVERDUE_STATES.has(record.billingAccessState)) {
      push('Payment overdue or in grace', 'billing', 'critical');
    } else if (RESTRICTED_STATES.has(record.billingAccessState)) {
      push('Restricted access — payment follow-up', 'billing', 'critical');
    }

    if (record.stuckReason === 'STUCK_NO_PRODUCTS') {
      push(getStuckReasonMessage(record.stuckReason) ?? 'No products yet', 'setup', 'high');
    } else if (record.stuckReason === 'STUCK_NO_STOCK') {
      push(getStuckReasonMessage(record.stuckReason) ?? 'No opening stock', 'setup', 'high');
    } else if (record.stuckReason === 'STUCK_NO_SALE') {
      push(getStuckReasonMessage(record.stuckReason) ?? 'No first sale', 'setup', 'high');
    } else if (record.stuckReason === 'STUCK_NO_REPORT') {
      push(getStuckReasonMessage(record.stuckReason) ?? 'Reports not viewed', 'setup', 'normal');
    } else if (record.stuckReason === 'STUCK_TRIAL_LOW_USAGE') {
      push(getStuckReasonMessage(record.stuckReason) ?? 'Trial ending with low usage', 'retention', 'high');
    }

    if (record.lastLoginAt) {
      const lastLogin = new Date(record.lastLoginAt);
      if (now.getTime() - lastLogin.getTime() >= 7 * dayMs) {
        push('No owner login in 7 days', 'usage', 'normal');
      }
    } else if (record.saleCount > 0) {
      push('No owner login recorded', 'usage', 'normal');
    }

    if (record.saleCount > 0 && record.salesLast7Days === 0) {
      push('No sales in the last 7 days', 'usage', 'high');
    }

    if (
      record.openSupportIssueCount > 0 &&
      !record.hasCriticalSupportIssue &&
      record.highestSupportPriority !== 'HIGH'
    ) {
      push(`Open support issue (${record.openSupportIssueCount})`, 'support', 'normal');
    }

    if (record.repeatSupportIssues) {
      push('Repeated support issues — possible churn risk', 'retention', 'high');
    }
  }

  const priorityOrder = { critical: 0, high: 1, normal: 2 };
  return items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

async function computeScaleCockpitData(now = new Date()): Promise<ScaleCockpitData> {
  const batch = await loadBatchActivationReadiness(now);
  const businessIds = batch.map((b) => b.businessId);
  const supportStatsMap = await loadSupportStatsByBusinessIds(businessIds, now);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const profiles = await prisma.controlBusinessProfile.findMany({
    where: businessIds.length > 0 ? { businessId: { in: businessIds } } : undefined,
    select: {
      businessId: true,
      ownerName: true,
      ownerPhone: true,
      ownerEmail: true,
      assignedAgentName: true,
      assignedManagerId: true,
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
      subscription: {
        select: { billingCadence: true, monthlyValuePence: true, outstandingAmountPence: true },
      },
    },
  });
  const profileMap = new Map(profiles.map((p) => [p.businessId, p]));

  const records: ScaleBusinessRecord[] = batch.map(({ businessId, readiness, snapshot }) => {
    const profile = profileMap.get(businessId);
    const support = supportStatsMap.get(businessId);
    const billing = computeBillingAccessState(snapshot.subscription, now);
    const plan = (snapshot.selectedPlan ?? snapshot.subscription.selectedPlan ?? 'STARTER').toString().toUpperCase();
    const planKey = plan === 'PRO' || plan === 'GROWTH' ? plan : 'STARTER';
    const monthlyValue = (profile?.subscription?.monthlyValuePence ?? 0) / 100 || planRates[planKey as keyof typeof planRates];
    const outstandingAmount = (profile?.subscription?.outstandingAmountPence ?? 0) / 100;

    const base: Omit<ScaleBusinessRecord, 'healthLabel' | 'portfolioHealth' | 'portfolioHealthReasons'> = {
      businessId,
      businessName: snapshot.name,
      ownerName: profile?.ownerName ?? 'Owner not assigned',
      ownerPhone: profile?.ownerPhone ?? snapshot.phone ?? '',
      ownerEmail: profile?.ownerEmail ?? '',
      location: snapshot.address,
      businessType: snapshot.businessCategory,
      branchCount: 0,
      plan: planKey,
      billingCadence: profile?.subscription?.billingCadence ?? 'MONTHLY',
      trialStartAt: formatIsoDate(snapshot.subscription.trialStartedAt),
      trialEndAt: formatIsoDate(snapshot.subscription.trialEndsAt),
      billingAccessState: billing.accessState,
      billingDaysRemaining: billing.daysRemaining,
      activationStatus: readiness.activationStatus,
      activationStatusLabel: getActivationStatusLabel(readiness.activationStatus),
      setupProgressPercent: readiness.setupProgressPercent,
      stuckReason: readiness.stuckReason,
      stuckMessage: getStuckReasonMessage(readiness.stuckReason),
      nextAction: readiness.nextAction,
      controlMessage: readiness.controlMessage,
      onboardingStage: readiness.onboardingStage,
      onboardingStageLabel: getOnboardingStageLabel(readiness.onboardingStage),
      productCount: snapshot.productCount,
      hasOpeningStock:
        snapshot.openingCapitalPence > 0 ||
        snapshot.purchaseCount > 0 ||
        snapshot.inventoryOnHandBase > 0,
      staffCount: snapshot.staffCount,
      purchaseCount: snapshot.purchaseCount,
      saleCount: snapshot.saleCount,
      salesLast7Days: snapshot.salesLast7Days,
      lastSaleAt: formatIsoDate(snapshot.lastSaleAt),
      lastOwnerDashboardViewAt: formatIsoDate(snapshot.ownerLastDashboardViewAt),
      lastReportViewAt: formatIsoDate(snapshot.ownerLastReportViewAt),
      lastLoginAt: formatIsoDate(snapshot.ownerLastLoginAt),
      supportStatus: profile?.supportStatus ?? 'HEALTHY',
      openSupportIssueCount: support?.openCount ?? snapshot.openSupportIssueCount,
      highestSupportPriority: support?.highestPriority ?? null,
      hasCriticalSupportIssue: support?.hasCritical ?? snapshot.hasCriticalSupportIssue,
      hasStaleSupportIssue: support?.hasStale ?? false,
      repeatSupportIssues: (support?.issueCountLast30Days ?? 0) >= 3,
      referralSource: profile?.referralSource ?? null,
      referredBy: profile?.referredBy ?? null,
      referredByName: profile?.referredByName ?? null,
      referredByPhone: profile?.referredByPhone ?? null,
      sourceChannel: profile?.sourceChannel ?? null,
      referralStatus: profile?.referralStatus ?? null,
      referralNextFollowUpAt: profile?.referralNextFollowUpAt?.toISOString() ?? null,
      referralNotes: profile?.referralNotes ?? null,
      assignedAgent: profile?.assignedAgentName ?? profile?.assignedManager?.name ?? 'Unassigned',
      assignedManagerId: profile?.assignedManagerId ?? null,
      churnRisk: readiness.churnRisk,
      isActivated: readiness.isActivated,
      isHealthy: readiness.isHealthy,
      storefrontEnabled: false,
      monthlyValue,
      outstandingAmount,
      signedUpAt: formatIsoDate(snapshot.createdAt) ?? '',
      completedSteps: readiness.completedSteps,
      missingSteps: readiness.missingSteps,
    };

    const healthLabel = resolveHealthLabel(base);
    const portfolio = computePortfolioHealth({ ...base, healthLabel } as ScaleBusinessRecord, now);
    return {
      ...base,
      healthLabel,
      portfolioHealth: portfolio.status,
      portfolioHealthReasons: portfolio.reasons,
    };
  });

  const storeCounts = await prisma.store.groupBy({
    by: ['businessId'],
    _count: { id: true },
    where: { businessId: { in: records.map((r) => r.businessId) } },
  });
  const storeMap = new Map(storeCounts.map((s) => [s.businessId, s._count.id]));
  const storefrontRows = await prisma.business.findMany({
    where: { id: { in: records.map((r) => r.businessId) } },
    select: { id: true, storefrontEnabled: true },
  });
  const storefrontMap = new Map(storefrontRows.map((b) => [b.id, b.storefrontEnabled]));

  for (const record of records) {
    record.branchCount = storeMap.get(record.businessId) ?? 1;
    record.storefrontEnabled = storefrontMap.get(record.businessId) ?? false;
  }

  const total = records.length;
  const pipeline: ScalePipelineStage[] = PIPELINE_STAGE_ORDER.map((key) => {
    const inStage = records.filter((r) => r.onboardingStage === key);
    return {
      key,
      label: getOnboardingStageLabel(key),
      count: inStage.length,
      percent: total === 0 ? 0 : Math.round((inStage.length / total) * 100),
      businesses: inStage.slice(0, 8).map((r) => ({
        id: r.businessId,
        name: r.businessName,
        nextAction: r.nextAction,
      })),
    };
  });

  const actionItems = buildActionItems(records, now);

  const overview = {
    totalBusinesses: total,
    newSignupsThisWeek: records.filter((r) => r.signedUpAt >= formatIsoDate(weekAgo)!).length,
    inSetup: records.filter((r) =>
      ['GETTING_STARTED', 'SETUP_IN_PROGRESS', 'READY_TO_SELL', 'STUCK', 'NEEDS_HELP'].includes(r.activationStatus)
    ).length,
    activeBusinesses: records.filter((r) => r.activationStatus === 'ACTIVE_BUSINESS').length,
    inTrial: records.filter((r) => TRIAL_STATES.has(r.billingAccessState)).length,
    paidBusinesses: records.filter((r) => r.billingAccessState === 'PAID_ACTIVE').length,
    overdueBusinesses: records.filter((r) => OVERDUE_STATES.has(r.billingAccessState)).length,
    restrictedBusinesses: records.filter((r) => RESTRICTED_STATES.has(r.billingAccessState)).length,
    needSetupHelp: records.filter((r) => r.healthLabel === 'Needs setup help' || r.activationStatus === 'STUCK').length,
    openSupportIssues: records.reduce((sum, r) => sum + r.openSupportIssueCount, 0),
    expectedMrr: records
      .filter((r) => r.billingAccessState !== 'CANCELLED')
      .reduce((sum, r) => sum + r.monthlyValue, 0),
    expectedCollectionsThisWeek: records
      .filter((r) => ['TRIAL_DUE_SOON', 'TRIAL_DUE_TODAY', 'RENEWAL_DUE_SOON', 'PAYMENT_DUE_TODAY', 'PAYMENT_OVERDUE_GRACE', 'TRIAL_EXPIRED_GRACE'].includes(r.billingAccessState))
      .reduce((sum, r) => sum + (r.outstandingAmount > 0 ? r.outstandingAmount : r.monthlyValue), 0),
    healthCritical: records.filter((r) => r.portfolioHealth === 'Critical').length,
    healthAtRisk: records.filter((r) => r.portfolioHealth === 'At Risk').length,
    healthNeedsAttention: records.filter((r) => r.portfolioHealth === 'Needs Attention').length,
    healthHealthy: records.filter((r) => r.portfolioHealth === 'Healthy').length,
  };

  const openIssueRows = await prisma.controlSupportIssue.findMany({
    where: { businessId: { in: businessIds }, status: { in: OPEN_SUPPORT_STATUSES } },
    orderBy: { lastUpdatedAt: 'desc' },
    include: {
      business: { select: { name: true } },
      assignedStaff: { select: { name: true } },
    },
  });

  const supportByBusiness: Record<string, SupportIssueRow[]> = {};
  for (const row of openIssueRows) {
    const mapped = mapIssueRow(
      {
        ...row,
        business: row.business,
        assignedStaff: row.assignedStaff,
      },
      now
    );
    if (!supportByBusiness[row.businessId]) supportByBusiness[row.businessId] = [];
    supportByBusiness[row.businessId].push(mapped);
  }

  return { overview, pipeline, actionItems, businesses: records, supportByBusiness };
}

const _cachedScaleCockpit = unstable_cache(
  async () => computeScaleCockpitData(),
  ['scale-cockpit-data'],
  { revalidate: 90, tags: ['control-portfolio', 'scale-cockpit'] }
);

export const getScaleCockpitData = cache(async () => _cachedScaleCockpit());

export function filterScaleBusinesses(
  businesses: ScaleBusinessRecord[],
  options: { filter?: string; search?: string; agent?: string; now?: Date }
) {
  const now = options.now ?? new Date();
  const search = options.search?.trim().toLowerCase() ?? '';
  const filter = options.filter ?? 'all';
  const agent = options.agent?.trim().toLowerCase() ?? '';

  return businesses.filter((record) => {
    if (filter !== 'all' && !matchesScaleFilter(record, filter, now)) return false;
    if (agent && !record.assignedAgent.toLowerCase().includes(agent)) return false;
    if (!search) return true;
    return [
      record.businessName,
      record.ownerName,
      record.ownerPhone,
      record.location ?? '',
      record.referralSource ?? '',
      record.referredByName ?? '',
      record.referredByPhone ?? '',
      record.referralNotes ?? '',
      record.assignedAgent,
      formatBusinessType(record.businessType),
    ].some((value) => value.toLowerCase().includes(search));
  });
}

export function paginateScaleBusinesses<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
    startIndex: total === 0 ? 0 : start + 1,
    endIndex: Math.min(start + pageSize, total),
  };
}
