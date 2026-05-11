import { planRates, type ManagedPlan } from '@/lib/control-data';

const DAY_MS = 24 * 60 * 60 * 1000;

type BillingCadence = 'MONTHLY' | 'ANNUAL';

type BillingAccessState =
  | 'TRIAL_ACTIVE'
  | 'TRIAL_DUE_SOON'
  | 'TRIAL_DUE_TODAY'
  | 'TRIAL_EXPIRED_GRACE'
  | 'TRIAL_RESTRICTED'
  | 'PAID_ACTIVE'
  | 'RENEWAL_DUE_SOON'
  | 'PAYMENT_DUE_TODAY'
  | 'PAYMENT_OVERDUE_GRACE'
  | 'PAYMENT_RESTRICTED'
  | 'CANCELLED'
  | 'READ_ONLY';

type SubscriptionInput = {
  selectedPlan?: ManagedPlan | null;
  plan?: ManagedPlan | null;
  planStatus?: string | null;
  subscriptionStatus?: string | null;
  trialStartedAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
  firstPaymentAt?: Date | string | null;
  currentPeriodStartedAt?: Date | string | null;
  currentPeriodEndsAt?: Date | string | null;
  nextBillingDate?: Date | string | null;
  nextPaymentDueAt?: Date | string | null;
  lastPaymentAt?: Date | string | null;
  paymentGraceEndsAt?: Date | string | null;
  suspendedAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  billingCadence?: string | null;
  timezone?: string | null;
};

type BillingAccessSnapshot = {
  accessState: BillingAccessState;
  isRestricted: boolean;
  isOverdue: boolean;
  suspendedAt: Date | null;
  paymentGraceEndsAt: Date | null;
  daysRemaining: number | null;
  displayStatus: string;
  controlMessage: string;
};

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCadence(value?: string | null): BillingCadence {
  return String(value ?? '').toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
}

function normalizePaidNextDueDate(nextDue: Date | null, lastPaymentAt: Date | null, cadence: BillingCadence, explicitStatus: string) {
  if (!nextDue || !lastPaymentAt) return nextDue;
  if (['READ_ONLY', 'CANCELLED', 'INACTIVE', 'DEACTIVATED'].includes(explicitStatus)) return nextDue;
  return nextDue.getTime() <= lastPaymentAt.getTime() ? calculateNextBillingDate(lastPaymentAt, cadence) : nextDue;
}

function wholeDaysUntil(later: Date | null, now: Date) {
  if (!later) return null;
  return Math.ceil((later.getTime() - now.getTime()) / DAY_MS);
}

function resolveDisplayStatus(state: BillingAccessState) {
  return state.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
}

function resolveControlMessage(state: BillingAccessState, daysRemaining: number | null) {
  switch (state) {
    case 'TRIAL_DUE_SOON':
      return `Trial ending soon${daysRemaining != null ? ` (${Math.max(daysRemaining, 0)} days left)` : ''}.`;
    case 'TRIAL_DUE_TODAY':
      return 'Trial ends today. Confirm payment to avoid interruption.';
    case 'TRIAL_EXPIRED_GRACE':
      return 'Trial expired and grace is active. Payment follow-up required.';
    case 'TRIAL_RESTRICTED':
      return 'Trial ended and access is restricted pending payment.';
    case 'RENEWAL_DUE_SOON':
      return `Renewal due soon${daysRemaining != null ? ` (${Math.max(daysRemaining, 0)} days left)` : ''}.`;
    case 'PAYMENT_DUE_TODAY':
      return 'Payment is due today.';
    case 'PAYMENT_OVERDUE_GRACE':
      return 'Payment is overdue but grace is active.';
    case 'PAYMENT_RESTRICTED':
      return 'Payment overdue and access is restricted.';
    case 'READ_ONLY':
      return 'Account is in read-only mode.';
    case 'CANCELLED':
      return 'Subscription cancelled.';
    case 'TRIAL_ACTIVE':
      return 'Trial is active.';
    case 'PAID_ACTIVE':
    default:
      return 'Paid access is active.';
  }
}

export function computeBillingAccessState(input: SubscriptionInput, now = new Date()): BillingAccessSnapshot {
  const trialEndsAt = toDate(input.trialEndsAt);
  const firstPaymentAt = toDate(input.firstPaymentAt);
  const cadence = normalizeCadence(input.billingCadence);
  const lastPaymentAt = toDate(input.lastPaymentAt);
  const explicit = String(input.subscriptionStatus ?? input.planStatus ?? '').toUpperCase();
  const nextDue = normalizePaidNextDueDate(
    toDate(input.nextBillingDate) ?? toDate(input.nextPaymentDueAt),
    lastPaymentAt,
    cadence,
    explicit
  );
  const paymentGraceEndsAt = toDate(input.paymentGraceEndsAt);
  const suspendedAt = toDate(input.suspendedAt);
  const cancelledAt = toDate(input.cancelledAt);
  const renewalWindowDays = cadence === 'ANNUAL' ? 30 : 7;

  let accessState: BillingAccessState;
  let daysRemaining: number | null = null;

  if (cancelledAt || ['CANCELLED', 'INACTIVE', 'DEACTIVATED'].includes(explicit)) {
    accessState = 'CANCELLED';
  } else if (explicit === 'READ_ONLY' || suspendedAt) {
    accessState = 'READ_ONLY';
  } else if (!firstPaymentAt) {
    daysRemaining = wholeDaysUntil(trialEndsAt, now);
    if (daysRemaining == null) {
      accessState = 'TRIAL_RESTRICTED';
    } else if (daysRemaining > 3) {
      accessState = 'TRIAL_ACTIVE';
    } else if (daysRemaining > 0) {
      accessState = 'TRIAL_DUE_SOON';
    } else if (daysRemaining === 0) {
      accessState = 'TRIAL_DUE_TODAY';
    } else if (paymentGraceEndsAt && now.getTime() <= paymentGraceEndsAt.getTime()) {
      accessState = 'TRIAL_EXPIRED_GRACE';
    } else {
      accessState = 'TRIAL_RESTRICTED';
    }
  } else {
    daysRemaining = wholeDaysUntil(nextDue, now);
    if (daysRemaining == null || daysRemaining > renewalWindowDays) {
      accessState = 'PAID_ACTIVE';
    } else if (daysRemaining > 0) {
      accessState = 'RENEWAL_DUE_SOON';
    } else if (daysRemaining === 0) {
      accessState = 'PAYMENT_DUE_TODAY';
    } else if (paymentGraceEndsAt && now.getTime() <= paymentGraceEndsAt.getTime()) {
      accessState = 'PAYMENT_OVERDUE_GRACE';
    } else {
      accessState = 'PAYMENT_RESTRICTED';
    }
  }

  const isRestricted = ['TRIAL_RESTRICTED', 'PAYMENT_RESTRICTED', 'CANCELLED', 'READ_ONLY'].includes(accessState);
  const isOverdue = ['TRIAL_EXPIRED_GRACE', 'TRIAL_RESTRICTED', 'PAYMENT_OVERDUE_GRACE', 'PAYMENT_RESTRICTED', 'READ_ONLY'].includes(accessState);

  return {
    accessState,
    isRestricted,
    isOverdue,
    suspendedAt,
    paymentGraceEndsAt,
    daysRemaining,
    displayStatus: resolveDisplayStatus(accessState),
    controlMessage: resolveControlMessage(accessState, daysRemaining),
  };
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function calculateNextBillingDate(fromDate: Date, cadence: BillingCadence = 'MONTHLY') {
  const nextDate = new Date(fromDate);
  if (cadence === 'ANNUAL') {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
    return nextDate;
  }
  nextDate.setMonth(nextDate.getMonth() + 1);
  return nextDate;
}

export function activateSubscriptionAfterPayment(input: {
  selectedPlan: ManagedPlan;
  plan?: ManagedPlan;
  paymentDate: Date;
  billingCadence?: BillingCadence;
  billingInterval?: BillingCadence;
  graceHours?: number;
  firstPaymentAt?: Date | string | null;
  amountPence?: number;
}) {
  const paymentDate = input.paymentDate;
  const selectedPlan = input.selectedPlan ?? input.plan ?? 'STARTER';
  const billingCadence = input.billingCadence ?? input.billingInterval ?? 'MONTHLY';
  const nextBillingDate = calculateNextBillingDate(paymentDate, billingCadence);
  const graceHours = input.graceHours ?? 48;
  const firstPaymentAt = toDate(input.firstPaymentAt) ?? paymentDate;

  return {
    subscriptionStatus: 'PAID_ACTIVE' as const,
    planStatus: 'PAID_ACTIVE' as const,
    firstPaymentAt,
    currentPeriodStartedAt: paymentDate,
    currentPeriodEndsAt: nextBillingDate,
    nextBillingDate,
    nextPaymentDueAt: nextBillingDate,
    paymentGraceEndsAt: addDays(nextBillingDate, Math.ceil(graceHours / 24)),
    lastPaymentAt: paymentDate,
    suspendedAt: null,
    cancelledAt: null,
    billingAmount: input.amountPence ?? planRates[selectedPlan],
    billingCurrency: 'GHS' as const,
    billingInterval: billingCadence,
  };
}
