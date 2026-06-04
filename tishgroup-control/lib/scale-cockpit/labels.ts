import { getActivationStatusLabel, getStuckReasonMessage } from '@/lib/vendor/activation-display';
import type { ScaleBusinessRecord } from './types';

export { getActivationStatusLabel, getStuckReasonMessage };

const STAGE_LABELS: Record<string, string> = {
  signed_up: 'Signed up',
  profile_completed: 'Profile completed',
  products_added: 'Products added',
  stock_added: 'Stock added',
  first_sale_completed: 'First sale completed',
  first_report_viewed: 'First report viewed',
  ready_to_pay: 'Ready to pay',
  paid_active: 'Paid / active',
};

export function getOnboardingStageLabel(stage: string) {
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, ' ');
}

export const PIPELINE_STAGE_RECOMMENDED_ACTION: Record<string, string> = {
  signed_up: 'Welcome the owner and confirm business profile.',
  profile_completed: 'Guide product import or first product entry.',
  products_added: 'Help record opening stock or first purchase.',
  stock_added: 'Coach first sale at the till.',
  first_sale_completed: 'Show owner the reports dashboard.',
  first_report_viewed: 'Confirm trial value and payment plan.',
  ready_to_pay: 'Confirm payment channel and record first payment.',
  paid_active: 'Check weekly usage and offer growth tips.',
};

export const PIPELINE_STAGE_ORDER = [
  'signed_up',
  'profile_completed',
  'products_added',
  'stock_added',
  'first_sale_completed',
  'first_report_viewed',
  'ready_to_pay',
  'paid_active',
] as const;

export function formatBusinessType(value: string | null) {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatIsoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function whatsappHref(phone: string, message: string) {
  const digits = phone.replace(/[^\d]/g, '');
  if (!digits) return null;
  const normalized = digits.startsWith('233') ? digits : digits.startsWith('0') ? `233${digits.slice(1)}` : `233${digits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function matchesScaleFilter(record: ScaleBusinessRecord, filter: string, now: Date): boolean {
  if (filter === 'all') return true;

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const signedUpRecent = record.signedUpAt >= formatIsoDate(weekAgo)!;

  switch (filter) {
    case 'new_signups':
      return signedUpRecent;
    case 'setup_in_progress':
      return record.activationStatus === 'SETUP_IN_PROGRESS' || record.activationStatus === 'GETTING_STARTED';
    case 'stuck_setup':
      return record.activationStatus === 'STUCK' || Boolean(record.stuckReason);
    case 'ready_to_sell':
      return record.activationStatus === 'READY_TO_SELL';
    case 'active_business':
      return record.activationStatus === 'ACTIVE_BUSINESS';
    case 'needs_help':
      return record.activationStatus === 'NEEDS_HELP' || record.activationStatus === 'STUCK';
    case 'trial_ending_soon':
      return ['TRIAL_DUE_SOON', 'TRIAL_DUE_TODAY'].includes(record.billingAccessState);
    case 'due_today':
      return record.billingAccessState === 'TRIAL_DUE_TODAY' || record.billingAccessState === 'PAYMENT_DUE_TODAY';
    case 'overdue':
      return ['TRIAL_EXPIRED_GRACE', 'PAYMENT_OVERDUE_GRACE', 'TRIAL_RESTRICTED', 'PAYMENT_RESTRICTED'].includes(record.billingAccessState);
    case 'restricted':
      return ['TRIAL_RESTRICTED', 'PAYMENT_RESTRICTED', 'READ_ONLY', 'CANCELLED'].includes(record.billingAccessState);
    case 'active_week':
      return record.salesLast7Days >= 5;
    case 'inactive_week':
      return record.saleCount > 0 && record.salesLast7Days < 5;
    case 'no_products':
      return record.productCount === 0;
    case 'no_stock':
      return record.productCount > 0 && !record.hasOpeningStock;
    case 'no_sales':
      return record.saleCount === 0;
    case 'reports_not_viewed':
      return record.saleCount > 0 && !record.lastReportViewAt;
    case 'needs_support':
      return record.openSupportIssueCount > 0 || record.supportStatus !== 'HEALTHY';
    case 'referred':
      return Boolean(record.referralSource);
    case 'assigned_agent':
      return record.assignedAgent !== 'Unassigned';
    case 'demo_requested':
      return record.referralStatus === 'DEMO_REQUESTED' || record.referralStatus === 'DEMO_BOOKED';
    case 'demo_completed':
      return record.referralStatus === 'DEMO_COMPLETED';
    case 'referral_trial':
      return record.referralStatus === 'TRIAL_STARTED' || record.referralStatus === 'ONBOARDED';
    case 'referral_paid':
      return record.referralStatus === 'PAID' || record.billingAccessState === 'PAID_ACTIVE';
    case 'referral_follow_up': {
      const today = formatIsoDate(now);
      return (
        record.referralStatus === 'FOLLOW_UP_LATER' ||
        Boolean(record.referralNextFollowUpAt && today && record.referralNextFollowUpAt <= today)
      );
    }
    case 'health_critical':
      return record.portfolioHealth === 'Critical';
    case 'health_at_risk':
      return record.portfolioHealth === 'At Risk';
    case 'health_needs_attention':
      return record.portfolioHealth === 'Needs Attention';
    case 'health_healthy':
      return record.portfolioHealth === 'Healthy';
    default:
      if (filter.startsWith('source:')) {
        return (record.referralSource ?? '').toUpperCase() === filter.slice(7).toUpperCase();
      }
      if (filter.startsWith('status:')) {
        return (record.referralStatus ?? '').toUpperCase() === filter.slice(7).toUpperCase();
      }
      return true;
  }
}
