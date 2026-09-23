import { paidArrGhs } from '@tillflow/lib/control-money';
import { planRates, type ManagedBusiness, type ManagedState } from '@/lib/control-data';

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const PAID_MRR_STATES: readonly ManagedState[] = [
  'PAID_ACTIVE',
  'RENEWAL_DUE_SOON',
  'PAYMENT_DUE_TODAY',
  'PAYMENT_OVERDUE_GRACE',
];

function parseDate(value?: string | null) {
  if (!value || value === 'Not scheduled') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value?: string | null) {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / DAY_MS);
}

function isDueThisWeek(business: ManagedBusiness) {
  if (business.state === 'RENEWAL_DUE_SOON' || business.state === 'PAYMENT_DUE_TODAY' || business.state === 'TRIAL_DUE_SOON' || business.state === 'TRIAL_DUE_TODAY') return true;
  const days = daysUntil(business.nextDueAt);
  return days != null && days >= 0 && days <= 7;
}

export function isPaidMrrBusiness(business: ManagedBusiness) {
  return PAID_MRR_STATES.includes(business.state);
}

export function formatCedi(value: number) {
  return `GHc ${value.toLocaleString('en-GH')}`;
}

export function getPortfolioSummary() {
  return getPortfolioSummaryFor([]);
}

export function getPortfolioSummaryFor(businesses: ManagedBusiness[]) {
  const activeBusinesses = businesses.filter((business) => business.state !== 'INACTIVE' && business.state !== 'CANCELLED');
  const paidBusinesses = businesses.filter(isPaidMrrBusiness);
  const totalBusinesses = businesses.length;
  const mrr = sum(paidBusinesses.map((business) => business.monthlyValue));
  const arr = sum(paidBusinesses.map((business) => paidArrGhs({
    monthlyValueGhs: business.monthlyValue,
    billingCadence: business.billingCadence,
  })));
  const expectedCollections = sum(
    activeBusinesses
      .filter((business) => ['TRIAL_DUE_SOON', 'TRIAL_DUE_TODAY', 'TRIAL_EXPIRED_GRACE', 'TRIAL_RESTRICTED', 'RENEWAL_DUE_SOON', 'PAYMENT_DUE_TODAY', 'PAYMENT_OVERDUE_GRACE', 'PAYMENT_RESTRICTED', 'READ_ONLY'].includes(business.state))
      .map((business) => business.outstandingAmount)
  );
  const activePaid = activeBusinesses.filter((business) => business.state === 'PAID_ACTIVE').length;
  const dueSoon = activeBusinesses.filter(isDueThisWeek).length;
  const grace = activeBusinesses.filter((business) => business.state === 'TRIAL_EXPIRED_GRACE' || business.state === 'PAYMENT_OVERDUE_GRACE').length;
  const fallback = activeBusinesses.filter((business) => business.state === 'TRIAL_RESTRICTED' || business.state === 'PAYMENT_RESTRICTED').length;
  const readOnly = activeBusinesses.filter((business) => business.state === 'READ_ONLY').length;

  return {
    totalBusinesses,
    mrr,
    arr,
    expectedCollections,
    activePaid,
    dueSoon,
    grace,
    fallback,
    readOnly,
  };
}

export function getRevenueByPlan() {
  return getRevenueByPlanFor([]);
}

export function getRevenueByPlanFor(businesses: ManagedBusiness[]) {
  return (Object.keys(planRates) as Array<keyof typeof planRates>).map((plan) => {
    const matchingBusinesses = businesses.filter((business) => business.plan === plan && isPaidMrrBusiness(business));
    const revenue = sum(matchingBusinesses.map((business) => business.monthlyValue));

    return {
      plan,
      count: matchingBusinesses.length,
      revenue,
    };
  });
}

export function getCollectionQueues() {
  return getCollectionQueuesFor([]);
}

export function getCollectionQueuesFor(businesses: ManagedBusiness[]) {
  return {
    healthy: businesses.filter((business) => business.state === 'PAID_ACTIVE' || business.state === 'TRIAL_ACTIVE'),
    dueSoon: businesses.filter((business) => business.state === 'RENEWAL_DUE_SOON' || business.state === 'PAYMENT_DUE_TODAY' || business.state === 'TRIAL_DUE_SOON' || business.state === 'TRIAL_DUE_TODAY'),
    overdue: businesses.filter((business) => business.state === 'TRIAL_EXPIRED_GRACE' || business.state === 'PAYMENT_OVERDUE_GRACE' || business.state === 'TRIAL_RESTRICTED' || business.state === 'PAYMENT_RESTRICTED'),
    locked: businesses.filter((business) => business.state === 'READ_ONLY'),
  };
}

export function getBusinessById(_businessId: string) {
  return undefined;
}

export function amountDueGhs(business: ManagedBusiness) {
  if (business.outstandingAmount > 0) {
    return business.outstandingAmount;
  }

  return 0;
}

export function getAccountMove(state: string, nextDueAt: string): string {
  const days = daysUntil(nextDueAt);
  const overdue = days == null ? 0 : Math.abs(days);

  switch (state) {
    case 'TRIAL_DUE_SOON':
    case 'RENEWAL_DUE_SOON':
      if (days == null) {
        return 'Due soon — send reminder and confirm payment channel.';
      }
      return days <= 1
        ? 'Due tomorrow — send reminder now and confirm MoMo or bank transfer.'
        : `Due in ${days} day${days === 1 ? '' : 's'} — send reminder and confirm payment channel.`;
    case 'TRIAL_DUE_TODAY':
    case 'PAYMENT_DUE_TODAY':
      return 'Due today — send reminder now and confirm MoMo or bank transfer.';
    case 'TRIAL_EXPIRED_GRACE':
    case 'PAYMENT_OVERDUE_GRACE':
      return `${overdue} day${overdue === 1 ? '' : 's'} past due — call now and push for same-day MoMo or transfer.`;
    case 'TRIAL_RESTRICTED':
    case 'PAYMENT_RESTRICTED':
      return `${overdue} day${overdue === 1 ? '' : 's'} past due, access restricted — escalate for partial or full payment today.`;
    case 'READ_ONLY':
      return `${overdue} day${overdue === 1 ? '' : 's'} past due, account locked — confirm payment first to restore access immediately.`;
    case 'CANCELLED':
    case 'INACTIVE':
      return 'Account cancelled — do not treat this as good standing.';
    case 'PAID_ACTIVE':
    case 'TRIAL_ACTIVE':
      return 'Account in good standing — confirm renewal prep and upsell readiness.';
    default:
      return 'Unknown account state — escalate to Control Admin before assuming good standing.';
  }
}

export function getAgingBucketsFor(businesses: ManagedBusiness[]) {
  const active = businesses.filter((b) => b.state !== 'INACTIVE' && b.state !== 'CANCELLED');
  const approachingList = active.filter((b) => b.state === 'RENEWAL_DUE_SOON' || b.state === 'PAYMENT_DUE_TODAY' || b.state === 'TRIAL_DUE_SOON' || b.state === 'TRIAL_DUE_TODAY');
  const overdueList = active.filter((b) => b.state === 'TRIAL_EXPIRED_GRACE' || b.state === 'PAYMENT_OVERDUE_GRACE' || b.state === 'TRIAL_RESTRICTED' || b.state === 'PAYMENT_RESTRICTED');
  const lockedList = active.filter((b) => b.state === 'READ_ONLY');
  const currentList = active.filter((b) => b.state === 'PAID_ACTIVE' || b.state === 'TRIAL_ACTIVE');

  return {
    current: {
      count: currentList.length,
      amount: sum(currentList.map((b) => b.monthlyValue)),
      label: 'Healthy',
      description: 'Active and up to date — no billing action needed right now.',
      href: '/collections#healthy',
    },
    approaching: {
      count: approachingList.length,
      amount: sum(approachingList.map((b) => b.outstandingAmount)),
      label: 'Due now',
      description: 'In billing window. Send reminders before these tip into overdue.',
      href: '/collections#dueSoon',
    },
    overdue: {
      count: overdueList.length,
      amount: sum(overdueList.map((b) => b.outstandingAmount)),
      label: 'Overdue',
      description: 'Operating on grace or restricted access. Same-day contact required.',
      href: '/collections#overdue',
    },
    locked: {
      count: lockedList.length,
      amount: sum(lockedList.map((b) => b.outstandingAmount)),
      label: 'Locked',
      description: 'Access restricted. Confirm payment or make a commercial decision.',
      href: '/collections#locked',
    },
  };
}

export function getActionChecklist(business: ManagedBusiness) {
  switch (business.state) {
    case 'TRIAL_DUE_SOON':
    case 'TRIAL_DUE_TODAY':
    case 'RENEWAL_DUE_SOON':
    case 'PAYMENT_DUE_TODAY':
      return ['Send reminder now', 'Confirm payment method', 'Verify owner contact is current'];
    case 'TRIAL_EXPIRED_GRACE':
    case 'PAYMENT_OVERDUE_GRACE':
    case 'TRIAL_RESTRICTED':
    case 'PAYMENT_RESTRICTED':
      return ['Call owner today', 'Record promised payment date', 'Escalate if no proof by close of day'];
    case 'READ_ONLY':
      return ['Escalate to account manager', 'Warn owner of read-only date', 'Prepare same-day restoration if payment lands'];
    case 'TRIAL_ACTIVE':
      return ['Book conversion meeting', 'Show reporting value used in trial', 'Set paid plan before trial end'];
    case 'PAID_ACTIVE':
      return ['Monitor usage health', 'Review upsell path', 'Keep renewal note current'];
    case 'CANCELLED':
      return ['Keep the account archived', 'Do not include in active billing follow-up', 'Reactivate only if the business returns to service'];
    default:
      return ['Unknown account state - escalate to Control Admin before taking action'];
  }
}
