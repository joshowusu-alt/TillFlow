import type { ScaleBusinessRecord } from '@/lib/scale-cockpit/types';

export type PortfolioHealthStatus = 'Healthy' | 'Needs Attention' | 'At Risk' | 'Critical';

export type PortfolioHealthResult = {
  status: PortfolioHealthStatus;
  reasons: string[];
};

const OVERDUE_BILLING = new Set([
  'TRIAL_EXPIRED_GRACE',
  'PAYMENT_OVERDUE_GRACE',
  'TRIAL_RESTRICTED',
  'PAYMENT_RESTRICTED',
]);

const RESTRICTED_BILLING = new Set(['TRIAL_RESTRICTED', 'PAYMENT_RESTRICTED', 'READ_ONLY', 'CANCELLED']);

const TRIAL_ENDING = new Set(['TRIAL_DUE_SOON', 'TRIAL_DUE_TODAY', 'RENEWAL_DUE_SOON', 'PAYMENT_DUE_TODAY']);

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / (24 * 60 * 60 * 1000));
}

/**
 * Portfolio health for Control Scale / Digest — distinct from merchant TillFlow billing.
 */
export function computePortfolioHealth(record: ScaleBusinessRecord, now = new Date()): PortfolioHealthResult {
  const reasons: string[] = [];

  if (record.hasCriticalSupportIssue) {
    reasons.push('Critical support issue open');
  }
  if (record.hasStaleSupportIssue) {
    reasons.push('Support issue not updated in 24+ hours');
  }
  if (record.openSupportIssueCount > 0 && record.highestSupportPriority === 'HIGH') {
    reasons.push('High-priority support issue open');
  } else if (record.openSupportIssueCount > 0) {
    reasons.push(`Open support issue (${record.openSupportIssueCount})`);
  }

  if (RESTRICTED_BILLING.has(record.billingAccessState)) {
    reasons.push('Account restricted — payment follow-up');
  } else if (OVERDUE_BILLING.has(record.billingAccessState)) {
    reasons.push('Trial or payment overdue / in grace');
  } else if (record.billingAccessState === 'TRIAL_DUE_TODAY' || record.billingAccessState === 'PAYMENT_DUE_TODAY') {
    reasons.push('Trial or payment due today');
  } else if (TRIAL_ENDING.has(record.billingAccessState)) {
    reasons.push('Trial or renewal ending soon');
  }

  if (record.outstandingAmount > 0) {
    reasons.push(`Outstanding balance GH₵ ${record.outstandingAmount.toLocaleString('en-GH')}`);
  }

  if (record.stuckReason === 'STUCK_NO_PRODUCTS') reasons.push('No products yet');
  if (record.stuckReason === 'STUCK_NO_STOCK') reasons.push('No opening stock');
  if (record.stuckReason === 'STUCK_NO_SALE') reasons.push('No first sale yet');
  if (record.stuckReason === 'STUCK_TRIAL_LOW_USAGE') reasons.push('Trial ending with low usage');

  const daysNoSale = daysSince(record.lastSaleAt, now);
  if (record.saleCount > 0 && record.salesLast7Days === 0) {
    reasons.push('No sales in the last 7 days');
  }
  if (record.saleCount > 0 && daysNoSale != null && daysNoSale >= 14) {
    reasons.push(`No sale in ${daysNoSale} days`);
  }

  const daysNoLogin = daysSince(record.lastLoginAt, now);
  if (record.saleCount > 0 && daysNoLogin != null && daysNoLogin >= 7) {
    reasons.push('No owner login in 7+ days');
  }

  if (record.activationStatus === 'STUCK' || record.activationStatus === 'NEEDS_HELP') {
    reasons.push(record.stuckMessage ?? 'Setup needs help');
  }

  if (record.churnRisk) reasons.push('Churn risk flagged');

  let status: PortfolioHealthStatus = 'Healthy';

  const critical =
    record.hasCriticalSupportIssue ||
    (RESTRICTED_BILLING.has(record.billingAccessState) && record.salesLast7Days > 0) ||
    (OVERDUE_BILLING.has(record.billingAccessState) && record.salesLast7Days > 0) ||
    (record.billingAccessState === 'TRIAL_DUE_TODAY' && record.openSupportIssueCount > 0);

  const atRisk =
    !critical &&
    (OVERDUE_BILLING.has(record.billingAccessState) ||
      RESTRICTED_BILLING.has(record.billingAccessState) ||
      record.billingAccessState === 'TRIAL_DUE_TODAY' ||
      record.billingAccessState === 'PAYMENT_DUE_TODAY' ||
      record.stuckReason === 'STUCK_NO_SALE' ||
      (record.saleCount > 0 && record.salesLast7Days === 0) ||
      (daysNoSale != null && daysNoSale >= 14) ||
      record.hasStaleSupportIssue ||
      record.churnRisk);

  const needsAttention =
    !critical &&
    !atRisk &&
    (record.openSupportIssueCount > 0 ||
      TRIAL_ENDING.has(record.billingAccessState) ||
      record.activationStatus === 'SETUP_IN_PROGRESS' ||
      record.activationStatus === 'GETTING_STARTED' ||
      record.activationStatus === 'NEEDS_HELP' ||
      record.healthLabel === 'Needs setup help' ||
      record.healthLabel === 'Low usage');

  if (critical) status = 'Critical';
  else if (atRisk) status = 'At Risk';
  else if (needsAttention) status = 'Needs Attention';
  else if (record.isHealthy && reasons.length === 0) status = 'Healthy';
  else if (reasons.length > 0) status = 'Needs Attention';

  return { status, reasons: reasons.slice(0, 6) };
}

export function portfolioHealthTone(status: PortfolioHealthStatus): string {
  switch (status) {
    case 'Critical':
      return 'bg-rose-100 text-rose-900 border-rose-200';
    case 'At Risk':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'Needs Attention':
      return 'bg-sky-50 text-sky-900 border-sky-200';
    default:
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
}
