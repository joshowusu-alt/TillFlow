import { matchesScaleFilter } from '@/lib/scale-cockpit/labels';
import type { ScaleBusinessRecord } from '@/lib/scale-cockpit/types';
import type { DigestActionRow, DigestBucket, DigestCounts } from './types';

const MAX_ROWS = 25;

function toRows(
  records: ScaleBusinessRecord[],
  reasonFn: (r: ScaleBusinessRecord) => string,
  priorityOrFn: DigestActionRow['priority'] | ((r: ScaleBusinessRecord) => DigestActionRow['priority'])
): DigestActionRow[] {
  return records.slice(0, MAX_ROWS).map((r) => ({
    businessId: r.businessId,
    businessName: r.businessName,
    ownerName: r.ownerName,
    ownerPhone: r.ownerPhone,
    reason: reasonFn(r),
    nextAction: r.nextAction,
    assignedAgent: r.assignedAgent,
    priority: typeof priorityOrFn === 'function' ? priorityOrFn(r) : priorityOrFn,
    category: 'digest',
  }));
}

export function computeDigestCounts(records: ScaleBusinessRecord[], now: Date): DigestCounts {
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  return {
    newSignupsToday: records.filter((r) => r.signedUpAt === today).length,
    newSignupsThisWeek: records.filter((r) => matchesScaleFilter(r, 'new_signups', now)).length,
    stuckSetup: records.filter((r) => matchesScaleFilter(r, 'stuck_setup', now)).length,
    noProducts: records.filter((r) => matchesScaleFilter(r, 'no_products', now)).length,
    noStock: records.filter((r) => matchesScaleFilter(r, 'no_stock', now)).length,
    noSales: records.filter((r) => matchesScaleFilter(r, 'no_sales', now)).length,
    noReportViewed: records.filter((r) => matchesScaleFilter(r, 'reports_not_viewed', now)).length,
    trialsEndingToday: records.filter((r) => r.billingAccessState === 'TRIAL_DUE_TODAY').length,
    trialsEndingIn3Days: records.filter((r) => r.billingAccessState === 'TRIAL_DUE_SOON').length,
    overdue: records.filter((r) => matchesScaleFilter(r, 'overdue', now)).length,
    restricted: records.filter((r) => matchesScaleFilter(r, 'restricted', now)).length,
    openCriticalSupport: records.filter((r) => r.hasCriticalSupportIssue).length,
    openHighSupport: records.filter((r) => r.highestSupportPriority === 'HIGH' && r.openSupportIssueCount > 0).length,
    staleSupport: records.filter((r) => r.hasStaleSupportIssue).length,
    demoRequestedNotBooked: records.filter((r) => r.referralStatus === 'DEMO_REQUESTED').length,
    demoCompletedNoTrial: records.filter(
      (r) =>
        r.referralStatus === 'DEMO_COMPLETED' &&
        !['TRIAL_ACTIVE', 'TRIAL_DUE_SOON', 'TRIAL_DUE_TODAY', 'PAID_ACTIVE'].includes(r.billingAccessState) &&
        r.saleCount === 0
    ).length,
    trialStartedNoSale: records.filter((r) => r.referralStatus === 'TRIAL_STARTED' && r.saleCount === 0).length,
    activeYesterday: records.filter((r) => r.lastSaleAt === yesterdayKey).length,
    inactive7Days: records.filter((r) => matchesScaleFilter(r, 'inactive_week', now)).length,
    expectedCollectionsThisWeek: 0,
    paidThisWeek: 0,
    healthy: records.filter((r) => r.isHealthy).length,
    portfolioCritical: records.filter((r) => r.portfolioHealth === 'Critical').length,
    portfolioAtRisk: records.filter((r) => r.portfolioHealth === 'At Risk').length,
    portfolioNeedsAttention: records.filter((r) => r.portfolioHealth === 'Needs Attention').length,
    portfolioHealthy: records.filter((r) => r.portfolioHealth === 'Healthy').length,
  };
}

export function buildDigestBuckets(
  records: ScaleBusinessRecord[],
  priorities: DigestActionRow[],
  now: Date
): DigestBucket[] {
  const todayPriorities = priorities.filter((p) => p.priority === 'critical' || p.priority === 'high').slice(0, MAX_ROWS);

  const trialPayment = records.filter((r) =>
    ['TRIAL_DUE_TODAY', 'TRIAL_DUE_SOON', 'TRIAL_EXPIRED_GRACE', 'PAYMENT_DUE_TODAY', 'PAYMENT_OVERDUE_GRACE', 'TRIAL_RESTRICTED', 'PAYMENT_RESTRICTED', 'RENEWAL_DUE_SOON'].includes(
      r.billingAccessState
    )
  );

  const setup = records.filter(
    (r) =>
      matchesScaleFilter(r, 'stuck_setup', now) ||
      matchesScaleFilter(r, 'no_products', now) ||
      matchesScaleFilter(r, 'no_stock', now) ||
      matchesScaleFilter(r, 'no_sales', now) ||
      matchesScaleFilter(r, 'reports_not_viewed', now)
  );

  const support = records.filter((r) => r.openSupportIssueCount > 0 || r.hasStaleSupportIssue);

  const referral = records.filter(
    (r) =>
      r.referralStatus === 'DEMO_REQUESTED' ||
      r.referralStatus === 'DEMO_BOOKED' ||
      r.referralStatus === 'DEMO_COMPLETED' ||
      (r.referralStatus === 'TRIAL_STARTED' && r.saleCount === 0) ||
      matchesScaleFilter(r, 'referral_follow_up', now)
  );

  const healthy = records.filter((r) => r.isHealthy).slice(0, 12);

  return [
    {
      key: 'priorities',
      label: "Needs action today",
      count: todayPriorities.length,
      rows: todayPriorities,
    },
    {
      key: 'trial_payment',
      label: 'Trial / payment follow-up',
      count: trialPayment.length,
      rows: toRows(trialPayment, (r) => `${r.billingAccessState.replace(/_/g, ' ')}${r.billingDaysRemaining != null ? ` · ${r.billingDaysRemaining}d` : ''}`, 'high'),
    },
    {
      key: 'setup',
      label: 'Setup follow-up',
      count: setup.length,
      rows: toRows(setup, (r) => r.stuckMessage ?? r.activationStatusLabel, 'high'),
    },
    {
      key: 'support',
      label: 'Support follow-up',
      count: support.length,
      rows: toRows(
        support,
        (r) =>
          r.hasCriticalSupportIssue
            ? 'Critical issue open'
            : r.hasStaleSupportIssue
              ? 'Stale issue 24h+'
              : `${r.openSupportIssueCount} open issue(s)`,
        (r) => (r.hasCriticalSupportIssue ? 'critical' : 'high')
      ),
    },
    {
      key: 'referral',
      label: 'Sales / referral follow-up',
      count: referral.length,
      rows: toRows(referral, (r) => (r.referralStatus ? r.referralStatus.replace(/_/g, ' ') : 'Referral follow-up'), 'normal'),
    },
    {
      key: 'healthy',
      label: 'Healthy businesses',
      count: healthy.length,
      rows: toRows(healthy, () => 'Active and on track', 'normal'),
    },
  ];
}
