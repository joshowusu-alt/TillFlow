import { PLAN_MONTHLY_PRICES } from './plan-pricing';
import type { BusinessPlan } from './features';

export const TRIAL_DAYS = 7;
export const DEFAULT_GRACE_HOURS = 48;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionStatus =
  | 'TRIAL_ACTIVE'
  | 'TRIAL_EXPIRING_SOON'
  | 'TRIAL_ENDED'
  | 'PAYMENT_PENDING'
  | 'ACTIVE'
  | 'DUE_SOON'
  | 'DUE_TODAY'
  | 'OVERDUE'
  | 'GRACE_PERIOD'
  | 'SUSPENDED'
  | 'CANCELLED';

export type BillingInterval = 'MONTHLY' | 'ANNUAL';

export type RestrictedFeature =
  | 'billing'
  | 'support'
  | 'account_settings'
  | 'dashboard_read'
  | 'sales'
  | 'purchases'
  | 'stock_adjustments'
  | 'online_store_publishing'
  | 'exports'
  | 'reports'
  | 'staff_expansion'
  | 'premium_features'
  | 'settings_write';

export type SubscriptionInput = {
  selectedPlan?: string | null;
  plan?: string | null;
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
  billingInterval?: string | null;
};

export type SubscriptionSnapshot = {
  selectedPlan: BusinessPlan;
  status: SubscriptionStatus;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  firstPaymentAt: Date | null;
  currentPeriodStartedAt: Date | null;
  currentPeriodEndsAt: Date | null;
  nextBillingDate: Date | null;
  lastPaymentAt: Date | null;
  paymentGraceEndsAt: Date | null;
  suspendedAt: Date | null;
  cancelledAt: Date | null;
  daysLeftInTrial: number | null;
  daysUntilBilling: number | null;
  billingInterval: BillingInterval;
  billingAmountPence: number;
  billingCurrency: 'GHS';
  isRestricted: boolean;
  canWrite: boolean;
};

export function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function normalizePlan(value?: string | null): BusinessPlan {
  const raw = String(value ?? '').toUpperCase();
  if (raw === 'PRO' || raw === 'GROWTH') return raw;
  return 'STARTER';
}

function normalizeInterval(value?: string | null): BillingInterval {
  return String(value ?? '').toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function calculateNextBillingDate(date: Date, interval: BillingInterval = 'MONTHLY') {
  const next = new Date(date);
  if (interval === 'ANNUAL') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

function wholeDaysUntil(date: Date | null, now: Date) {
  if (!date) return null;
  return Math.ceil((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS);
}

export function getTrialDaysLeft(input: SubscriptionInput, now = new Date()) {
  const trialEndsAt = toDate(input.trialEndsAt);
  const days = wholeDaysUntil(trialEndsAt, now);
  return days == null ? null : Math.max(0, days);
}

export function getDaysUntilBilling(input: SubscriptionInput, now = new Date()) {
  const nextBillingDate = toDate(input.nextBillingDate) ?? toDate(input.nextPaymentDueAt) ?? toDate(input.currentPeriodEndsAt);
  return wholeDaysUntil(nextBillingDate, now);
}

function explicitTerminalStatus(input: SubscriptionInput): SubscriptionStatus | null {
  const status = String(input.subscriptionStatus ?? input.planStatus ?? '').toUpperCase();
  if (status === 'CANCELLED' || status === 'INACTIVE' || status === 'DEACTIVATED') return 'CANCELLED';
  if (status === 'SUSPENDED' || status === 'READ_ONLY') return 'SUSPENDED';
  return null;
}

export function getSubscriptionStatus(input: SubscriptionInput, now = new Date()): SubscriptionStatus {
  const terminal = explicitTerminalStatus(input);
  if (terminal) return terminal;

  const rawStatus = String(input.subscriptionStatus ?? input.planStatus ?? '').toUpperCase();
  const trialEndsAt = toDate(input.trialEndsAt);
  const firstPaymentAt = toDate(input.firstPaymentAt) ?? toDate(input.lastPaymentAt);
  const nextBillingDate = toDate(input.nextBillingDate) ?? toDate(input.nextPaymentDueAt) ?? toDate(input.currentPeriodEndsAt);
  const paymentGraceEndsAt = toDate(input.paymentGraceEndsAt);

  if (!firstPaymentAt) {
    if (trialEndsAt && now.getTime() < trialEndsAt.getTime()) {
      const daysLeft = getTrialDaysLeft(input, now) ?? TRIAL_DAYS;
      return daysLeft <= 3 ? 'TRIAL_EXPIRING_SOON' : 'TRIAL_ACTIVE';
    }

    if (paymentGraceEndsAt && now.getTime() <= paymentGraceEndsAt.getTime()) {
      return 'GRACE_PERIOD';
    }

    if (rawStatus === 'PAYMENT_PENDING' || rawStatus === 'TRIAL_ENDED') return 'PAYMENT_PENDING';
    return trialEndsAt ? 'PAYMENT_PENDING' : 'TRIAL_ACTIVE';
  }

  if (!nextBillingDate) return 'ACTIVE';

  const daysUntilBilling = getDaysUntilBilling(input, now) ?? 0;
  if (daysUntilBilling > 5) return 'ACTIVE';
  if (daysUntilBilling > 0) return 'DUE_SOON';
  if (daysUntilBilling === 0) return 'DUE_TODAY';

  if (paymentGraceEndsAt && now.getTime() <= paymentGraceEndsAt.getTime()) return 'GRACE_PERIOD';
  return paymentGraceEndsAt ? 'SUSPENDED' : 'OVERDUE';
}

export function getSubscriptionSnapshot(input: SubscriptionInput, now = new Date()): SubscriptionSnapshot {
  const selectedPlan = normalizePlan(input.selectedPlan ?? input.plan);
  const status = getSubscriptionStatus(input, now);
  const billingInterval = normalizeInterval(input.billingInterval);
  const billingAmountPence = PLAN_MONTHLY_PRICES[selectedPlan] * 100;
  const isRestricted = status === 'SUSPENDED' || status === 'CANCELLED';

  return {
    selectedPlan,
    status,
    trialStartedAt: toDate(input.trialStartedAt),
    trialEndsAt: toDate(input.trialEndsAt),
    firstPaymentAt: toDate(input.firstPaymentAt),
    currentPeriodStartedAt: toDate(input.currentPeriodStartedAt),
    currentPeriodEndsAt: toDate(input.currentPeriodEndsAt),
    nextBillingDate: toDate(input.nextBillingDate) ?? toDate(input.nextPaymentDueAt) ?? toDate(input.currentPeriodEndsAt),
    lastPaymentAt: toDate(input.lastPaymentAt),
    paymentGraceEndsAt: toDate(input.paymentGraceEndsAt),
    suspendedAt: toDate(input.suspendedAt),
    cancelledAt: toDate(input.cancelledAt),
    daysLeftInTrial: getTrialDaysLeft(input, now),
    daysUntilBilling: getDaysUntilBilling(input, now),
    billingInterval,
    billingAmountPence,
    billingCurrency: 'GHS',
    isRestricted,
    canWrite: !isRestricted,
  };
}

export function canUseFeature(feature: RestrictedFeature, input: SubscriptionInput, now = new Date()) {
  const status = getSubscriptionStatus(input, now);
  if (status !== 'SUSPENDED' && status !== 'CANCELLED') return true;
  return ['billing', 'support', 'account_settings', 'dashboard_read'].includes(feature);
}

export function requireActiveSubscription(feature: RestrictedFeature, input: SubscriptionInput, now = new Date()) {
  if (!canUseFeature(feature, input, now)) {
    throw new Error('Your TillFlow subscription needs payment before this feature can continue.');
  }
}

export function activateSubscriptionAfterPayment(input: SubscriptionInput & { paymentDate?: Date; amountPence?: number | null }) {
  const paymentDate = input.paymentDate ?? new Date();
  const billingInterval = normalizeInterval(input.billingInterval);
  const nextBillingDate = calculateNextBillingDate(paymentDate, billingInterval);
  const firstPaymentAt = toDate(input.firstPaymentAt) ?? paymentDate;

  return {
    subscriptionStatus: 'ACTIVE' as const,
    planStatus: 'ACTIVE',
    firstPaymentAt,
    currentPeriodStartedAt: paymentDate,
    currentPeriodEndsAt: nextBillingDate,
    nextBillingDate,
    nextPaymentDueAt: nextBillingDate,
    lastPaymentAt: paymentDate,
    paymentGraceEndsAt: null,
    suspendedAt: null,
    cancelledAt: null,
    billingAmount: input.amountPence ?? PLAN_MONTHLY_PRICES[normalizePlan(input.selectedPlan ?? input.plan)] * 100,
    billingCurrency: 'GHS',
    billingInterval,
  };
}

export function createTrialSubscription(plan: BusinessPlan, now = new Date()) {
  const trialEndsAt = addDays(now, TRIAL_DAYS);
  return {
    plan,
    selectedPlan: plan,
    planStatus: 'TRIAL_ACTIVE',
    subscriptionStatus: 'TRIAL_ACTIVE',
    trialStartedAt: now,
    trialEndsAt,
    planSetAt: now,
    billingAmount: PLAN_MONTHLY_PRICES[plan] * 100,
    billingCurrency: 'GHS',
    billingInterval: 'MONTHLY',
    nextBillingDate: null,
    nextPaymentDueAt: trialEndsAt,
  };
}

export function getMerchantSubscriptionMessage(input: SubscriptionInput, now = new Date()) {
  const snapshot = getSubscriptionSnapshot(input, now);
  const planName = `${snapshot.selectedPlan.slice(0, 1)}${snapshot.selectedPlan.slice(1).toLowerCase()}`;
  const trialEnd = snapshot.trialEndsAt?.toLocaleDateString('en-GB');

  if (snapshot.status === 'TRIAL_ACTIVE' || snapshot.status === 'TRIAL_EXPIRING_SOON') {
    const days = snapshot.daysLeftInTrial ?? 0;
    if (days === 1) return 'Your TillFlow trial ends tomorrow.';
    if (days === 0) return 'Your TillFlow trial ends today. Complete payment to continue using TillFlow.';
    if (days <= 3) return `Your TillFlow trial ends in ${days} days.`;
    return `Trial active - ${days} days left. Your ${planName} trial ends on ${trialEnd}. Add payment to continue without interruption.`;
  }

  if (snapshot.status === 'PAYMENT_PENDING' || snapshot.status === 'TRIAL_ENDED') {
    return 'Your trial has ended. Complete payment to continue.';
  }

  if (snapshot.status === 'GRACE_PERIOD') {
    return 'Payment is pending. Complete payment now to keep your shop running smoothly.';
  }

  if (snapshot.status === 'SUSPENDED') {
    return 'Full access is paused until payment is confirmed. Billing, support, account settings, and read-only dashboard access remain available.';
  }

  if (snapshot.status === 'DUE_TODAY') {
    return 'Your TillFlow subscription is due today. Complete payment to continue without interruption.';
  }

  if (snapshot.status === 'DUE_SOON') {
    return `Your TillFlow subscription is due in ${snapshot.daysUntilBilling} days.`;
  }

  if (snapshot.status === 'OVERDUE') {
    return 'Your TillFlow subscription payment is overdue. Complete payment to keep full access active.';
  }

  return `Payment confirmed. Your TillFlow subscription is active until ${snapshot.nextBillingDate?.toLocaleDateString('en-GB') ?? 'your next billing date'}.`;
}
