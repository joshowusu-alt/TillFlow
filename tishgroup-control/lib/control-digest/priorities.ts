import { formatIsoDate, getStuckReasonMessage, whatsappHref } from '@/lib/scale-cockpit/labels';
import type { ScaleBusinessRecord } from '@/lib/scale-cockpit/types';
import type { DigestActionRow, DigestPriority } from './types';

const OVERDUE = new Set(['TRIAL_EXPIRED_GRACE', 'PAYMENT_OVERDUE_GRACE', 'TRIAL_RESTRICTED', 'PAYMENT_RESTRICTED']);
const RESTRICTED = new Set(['TRIAL_RESTRICTED', 'PAYMENT_RESTRICTED', 'READ_ONLY', 'CANCELLED']);

function row(
  record: ScaleBusinessRecord,
  reason: string,
  category: string,
  priority: DigestPriority
): DigestActionRow {
  return {
    businessId: record.businessId,
    businessName: record.businessName,
    ownerName: record.ownerName,
    ownerPhone: record.ownerPhone,
    reason,
    nextAction: record.nextAction,
    assignedAgent: record.assignedAgent,
    priority,
    category,
  };
}

export function buildDigestPriorities(records: ScaleBusinessRecord[], now: Date): DigestActionRow[] {
  const items: DigestActionRow[] = [];
  const today = formatIsoDate(now)!;

  const seen = new Set<string>();

  const push = (item: DigestActionRow) => {
    const key = `${item.businessId}:${item.category}:${item.reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  for (const record of records) {
    if (RESTRICTED.has(record.billingAccessState) && record.salesLast7Days > 0) {
      push(row(record, 'Restricted but still selling — urgent payment', 'billing', 'critical'));
    }
    if (record.hasCriticalSupportIssue) {
      push(row(record, 'Critical support issue open', 'support', 'critical'));
    }
    if (OVERDUE.has(record.billingAccessState) && record.salesLast7Days > 0) {
      push(row(record, 'Payment overdue with active usage', 'billing', 'critical'));
    }
    if (record.billingAccessState === 'TRIAL_RESTRICTED' || record.billingAccessState === 'TRIAL_EXPIRED_GRACE') {
      push(row(record, 'Trial ended — payment needed', 'billing', 'critical'));
    }
    if (
      (record.stuckReason === 'STUCK_NO_PRODUCTS' || record.stuckReason === 'STUCK_NO_STOCK' || record.stuckReason === 'STUCK_NO_SALE') &&
      record.openSupportIssueCount > 0
    ) {
      push(row(record, 'Cannot sell — setup blocked by support', 'setup', 'critical'));
    }
  }

  for (const record of records) {
    if (record.billingAccessState === 'TRIAL_DUE_TODAY' || record.billingAccessState === 'PAYMENT_DUE_TODAY') {
      push(row(record, 'Trial or payment due today', 'billing', 'high'));
    }
    if (record.billingAccessState === 'TRIAL_DUE_SOON' || record.billingAccessState === 'RENEWAL_DUE_SOON') {
      push(row(record, 'Trial or renewal ending within 3 days', 'billing', 'high'));
    }
    if (record.stuckReason === 'STUCK_NO_SALE' || (record.referralStatus === 'TRIAL_STARTED' && record.saleCount === 0)) {
      push(row(record, 'Stuck before first sale', 'setup', 'high'));
    }
    if (record.stuckReason === 'STUCK_NO_STOCK') {
      push(row(record, getStuckReasonMessage(record.stuckReason) ?? 'No opening stock', 'setup', 'high'));
    }
    if (record.referralStatus === 'DEMO_COMPLETED' && record.billingAccessState !== 'PAID_ACTIVE' && record.saleCount === 0) {
      const inTrial = ['TRIAL_ACTIVE', 'TRIAL_DUE_SOON', 'TRIAL_DUE_TODAY'].includes(record.billingAccessState);
      if (!inTrial) {
        push(row(record, 'Demo completed — trial not started', 'referral', 'high'));
      }
    }
    if (record.highestSupportPriority === 'HIGH' && record.openSupportIssueCount > 0) {
      push(row(record, 'High-priority support issue', 'support', 'high'));
    }
    if (record.hasStaleSupportIssue) {
      push(row(record, 'Support issue stale 24+ hours', 'support', 'high'));
    }
    if (record.referralStatus === 'DEMO_REQUESTED') {
      push(row(record, 'Demo requested — not booked', 'referral', 'high'));
    }
    if (record.referralStatus === 'DEMO_BOOKED') {
      push(row(record, 'Demo booked — confirm completion', 'referral', 'normal'));
    }
  }

  for (const record of records) {
    if (record.stuckReason === 'STUCK_NO_REPORT') {
      push(row(record, 'Sales recorded but reports not viewed', 'setup', 'normal'));
    }
    if (record.saleCount > 0 && record.salesLast7Days === 0) {
      push(row(record, 'Inactive — no sales in 7 days', 'usage', 'normal'));
    }
    const followUpDate = record.referralNextFollowUpAt?.slice(0, 10);
    if (followUpDate && followUpDate <= today) {
      push(row(record, 'Referral follow-up due', 'referral', 'normal'));
    }
    if (record.referralStatus === 'FOLLOW_UP_LATER') {
      push(row(record, 'Referral marked follow-up later', 'referral', 'normal'));
    }
    if (record.billingAccessState === 'RENEWAL_DUE_SOON') {
      push(row(record, 'Payment follow-up soon', 'billing', 'normal'));
    }
    if (
      record.billingAccessState === 'TRIAL_ACTIVE' &&
      record.billingDaysRemaining != null &&
      record.billingDaysRemaining <= 7 &&
      record.billingDaysRemaining > 3
    ) {
      push(row(record, 'Trial ending within 7 days', 'billing', 'normal'));
    }
    if (['GETTING_STARTED', 'SETUP_IN_PROGRESS', 'STUCK'].includes(record.activationStatus)) {
      if (record.setupProgressPercent < 100 && record.activationStatus !== 'ACTIVE_BUSINESS') {
        push(row(record, 'Setup incomplete', 'setup', 'normal'));
      }
    }
    if (!record.lastOwnerDashboardViewAt && record.saleCount > 0) {
      push(row(record, 'Owner has not viewed dashboard', 'usage', 'normal'));
    }
    if (record.openSupportIssueCount >= 2) {
      push(row(record, 'Multiple open support issues', 'support', 'normal'));
    }
  }

  const order: Record<DigestPriority, number> = { critical: 0, high: 1, normal: 2 };
  return items.sort((a, b) => order[a.priority] - order[b.priority]);
}

export function whatsappLink(phone: string, message: string) {
  return whatsappHref(phone, message);
}
