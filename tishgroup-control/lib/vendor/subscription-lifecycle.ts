import { computeSubscriptionPricing, PLAN_MONTHLY_PRICES } from './plan-pricing';
import type { BusinessPlan } from './features';
import { formatBusinessLocalDateKey, resolveBusinessTimeZone } from './notifications/utils';

export const TRIAL_DAYS = 7;
export const DEFAULT_GRACE_HOURS = 48;

const DAY_MS = 24 * 60 * 60 * 1000;

export type BillingAccessState =
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

export type SubscriptionStatus =
  | BillingAccessState;

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

const ALL_FEATURES: RestrictedFeature[] = [
  'billing',
  'support',
  'account_settings',
  'dashboard_read',
  'sales',
  'purchases',
  'stock_adjustments',
  'online_store_publishing',
  'exports',
  'reports',
  'staff_expansion',
  'premium_features',
  'settings_write',
];

const RESTRICTED_FEATURES: RestrictedFeature[] = [
  'sales',
  'purchases',
  'stock_adjustments',
  'staff_expansion',
  'online_store_publishing',
  'exports',
  'reports',
  'premium_features',
  'settings_write',
];

const RESTRICTED_ALLOWED_FEATURES: RestrictedFeature[] = [
  'billing',
  'support',
  'account_settings',
  'dashboard_read',
];

const RESTRICTED_ACCESS_STATES = new Set<BillingAccessState>([
  'TRIAL_RESTRICTED',
  'PAYMENT_RESTRICTED',
  'CANCELLED',
  'READ_ONLY',
]);

export type SubscriptionInput = {
  selectedPlan?: string | null;
  plan?: string | null;
  planStatus?: string | null;
  subscriptionStatus?: string | null;
  timezone?: string | null;
  trialStartedAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
  firstPaymentAt?: Date | string | null;
  firstPaymentConfirmedAt?: Date | string | null;
  currentPeriodStartedAt?: Date | string | null;
  currentPeriodStart?: Date | string | null;
  currentPeriodEndsAt?: Date | string | null;
  currentPeriodEnd?: Date | string | null;
  nextBillingDate?: Date | string | null;
  nextPaymentDueAt?: Date | string | null;
  lastPaymentAt?: Date | string | null;
  lastPaymentRecordedAt?: Date | string | null;
  paymentGraceEndsAt?: Date | string | null;
  graceEndsAt?: Date | string | null;
  suspendedAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  billingInterval?: string | null;
  billingCadence?: string | null;
  billingAmount?: number | null;
  addonOnlineStorefront?: boolean | null;
};

export type BillingAccessComputation = {
  selectedPlan: BusinessPlan;
  accessState: BillingAccessState;
  displayStatus: string;
  daysRemaining: number | null;
  isTrial: boolean;
  isPaid: boolean;
  isOverdue: boolean;
  isRestricted: boolean;
  allowedFeatures: RestrictedFeature[];
  restrictedFeatures: RestrictedFeature[];
  primaryBanner: string | null;
  merchantMessage: string;
  controlMessage: string;
  nextActionLabel: string;
  nextActionHref: string;
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
  billingInterval: BillingInterval;
  billingAmountPence: number;
  billingCurrency: 'GHS';
};

export type SubscriptionSnapshot = {
  selectedPlan: BusinessPlan;
  status: SubscriptionStatus;
  accessState: BillingAccessState;
  displayStatus: string;
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
  daysRemaining: number | null;
  billingInterval: BillingInterval;
  billingAmountPence: number;
  billingCurrency: 'GHS';
  isRestricted: boolean;
  canWrite: boolean;
  isTrial: boolean;
  isPaid: boolean;
  isOverdue: boolean;
  allowedFeatures: RestrictedFeature[];
  restrictedFeatures: RestrictedFeature[];
  primaryBanner: string | null;
  merchantMessage: string;
  controlMessage: string;
  nextActionLabel: string;
  nextActionHref: string;
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

function resolveBillingDate(input: SubscriptionInput, key: 'trialEndsAt' | 'paymentGraceEndsAt' | 'nextBillingDate' | 'nextPaymentDueAt' | 'currentPeriodEndsAt') {
  switch (key) {
    case 'trialEndsAt':
      return toDate(input.trialEndsAt);
    case 'paymentGraceEndsAt':
      return toDate(input.paymentGraceEndsAt ?? input.graceEndsAt);
    case 'nextBillingDate':
      return toDate(input.nextBillingDate);
    case 'nextPaymentDueAt':
      return toDate(input.nextPaymentDueAt);
    case 'currentPeriodEndsAt':
      return toDate(input.currentPeriodEndsAt ?? input.currentPeriodEnd);
  }
}

function normalizePaidNextBillingDate(
  nextBillingDate: Date | null,
  lastPaymentAt: Date | null,
  billingInterval: BillingInterval,
  explicitStatus: string
) {
  if (!nextBillingDate || !lastPaymentAt) return nextBillingDate;
  if (['READ_ONLY', 'CANCELLED', 'INACTIVE', 'DEACTIVATED'].includes(explicitStatus)) return nextBillingDate;
  return nextBillingDate.getTime() <= lastPaymentAt.getTime()
    ? calculateNextBillingDate(lastPaymentAt, billingInterval)
    : nextBillingDate;
}

function normalizeCurrentPeriodStartedAt(currentPeriodStartedAt: Date | null, lastPaymentAt: Date | null) {
  if (!lastPaymentAt) return currentPeriodStartedAt;
  if (!currentPeriodStartedAt) return lastPaymentAt;
  return currentPeriodStartedAt.getTime() < lastPaymentAt.getTime() ? lastPaymentAt : currentPeriodStartedAt;
}

function normalizeCurrentPeriodEndsAt(
  currentPeriodEndsAt: Date | null,
  currentPeriodStartedAt: Date | null,
  nextBillingDate: Date | null
) {
  if (currentPeriodEndsAt && (!currentPeriodStartedAt || currentPeriodEndsAt.getTime() > currentPeriodStartedAt.getTime())) {
    return currentPeriodEndsAt;
  }
  return nextBillingDate;
}

function normalizeBillingAmountPence(
  billingAmount: number | null | undefined,
  selectedPlan: BusinessPlan,
  billingInterval: BillingInterval,
  addonOnlineStorefront?: boolean | null
) {
  const pricing = computeSubscriptionPricing({
    plan: selectedPlan,
    addonOnlineStorefront,
    billingInterval,
  });

  if (!Number.isFinite(billingAmount) || billingAmount == null || billingAmount <= 0) {
    const amountGhs = billingInterval === 'ANNUAL' ? pricing.totalAnnualGhs : pricing.totalMonthlyGhs;
    return amountGhs * 100;
  }

  const baselineGhs = billingInterval === 'ANNUAL' ? pricing.totalAnnualGhs : pricing.totalMonthlyGhs;
  return billingAmount < baselineGhs * 10 ? billingAmount * 100 : billingAmount;
}

function localDayKey(date: Date, timeZone: string) {
  return formatBusinessLocalDateKey(date, timeZone);
}

function daysBetweenLocalDates(later: Date | null, earlier: Date, timeZone: string) {
  if (!later) return null;
  const laterKey = localDayKey(later, timeZone);
  const earlierKey = localDayKey(earlier, timeZone);
  const [laterYear, laterMonth, laterDay] = laterKey.split('-').map(Number);
  const [earlierYear, earlierMonth, earlierDay] = earlierKey.split('-').map(Number);
  return Math.round((Date.UTC(laterYear, laterMonth - 1, laterDay) - Date.UTC(earlierYear, earlierMonth - 1, earlierDay)) / DAY_MS);
}

function displayPlanName(plan: BusinessPlan) {
  return `${plan.slice(0, 1)}${plan.slice(1).toLowerCase()}`;
}

function formatDays(value: number | null) {
  if (value == null) return null;
  const absolute = Math.abs(value);
  return `${absolute} day${absolute === 1 ? '' : 's'}`;
}

function computeTrialState(args: {
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
  today: Date;
  timeZone: string;
}) {
  const { trialEndsAt, graceEndsAt, today, timeZone } = args;
  const daysRemaining = daysBetweenLocalDates(trialEndsAt, today, timeZone);

  if (!trialEndsAt) {
    return {
      accessState: 'TRIAL_RESTRICTED' as const,
      daysRemaining: null,
    };
  }

  if (daysRemaining == null) {
    return {
      accessState: 'TRIAL_RESTRICTED' as const,
      daysRemaining: null,
    };
  }

  if (daysRemaining > 3) {
    return { accessState: 'TRIAL_ACTIVE' as const, daysRemaining };
  }
  if (daysRemaining > 0) {
    return { accessState: 'TRIAL_DUE_SOON' as const, daysRemaining };
  }
  if (daysRemaining === 0) {
    return { accessState: 'TRIAL_DUE_TODAY' as const, daysRemaining };
  }
  if (graceEndsAt && daysBetweenLocalDates(graceEndsAt, today, timeZone) != null && daysBetweenLocalDates(graceEndsAt, today, timeZone)! >= 0) {
    return { accessState: 'TRIAL_EXPIRED_GRACE' as const, daysRemaining };
  }
  return { accessState: 'TRIAL_RESTRICTED' as const, daysRemaining };
}

function computePaidState(args: {
  dueDate: Date | null;
  graceEndsAt: Date | null;
  today: Date;
  timeZone: string;
  billingInterval: BillingInterval;
}) {
  const { dueDate, graceEndsAt, today, timeZone, billingInterval } = args;
  const daysRemaining = daysBetweenLocalDates(dueDate, today, timeZone);
  const renewalWindowDays = billingInterval === 'ANNUAL' ? 30 : 7;

  if (!dueDate) {
    return { accessState: 'PAID_ACTIVE' as const, daysRemaining: null };
  }

  if (daysRemaining == null) {
    return { accessState: 'PAID_ACTIVE' as const, daysRemaining: null };
  }

  if (daysRemaining > renewalWindowDays) {
    return { accessState: 'PAID_ACTIVE' as const, daysRemaining };
  }
  if (daysRemaining > 0) {
    return { accessState: 'RENEWAL_DUE_SOON' as const, daysRemaining };
  }
  if (daysRemaining === 0) {
    return { accessState: 'PAYMENT_DUE_TODAY' as const, daysRemaining };
  }
  if (graceEndsAt && daysBetweenLocalDates(graceEndsAt, today, timeZone) != null && daysBetweenLocalDates(graceEndsAt, today, timeZone)! >= 0) {
    return { accessState: 'PAYMENT_OVERDUE_GRACE' as const, daysRemaining };
  }
  return { accessState: 'PAYMENT_RESTRICTED' as const, daysRemaining };
}

function resolveAccessCopy(accessState: BillingAccessState, selectedPlan: BusinessPlan, daysRemaining: number | null, nextBillingDate: Date | null, trialEndsAt: Date | null) {
  const planName = displayPlanName(selectedPlan);
  const daysLabel = formatDays(daysRemaining);
  const dueLabel = nextBillingDate?.toLocaleDateString('en-GB') ?? 'your next billing date';
  const trialLabel = trialEndsAt?.toLocaleDateString('en-GB') ?? 'your trial end date';

  switch (accessState) {
    case 'TRIAL_ACTIVE':
      return {
        displayStatus: 'Trial active',
        primaryBanner: daysLabel ? `Your TillFlow trial has ${daysLabel} left.` : 'Your TillFlow trial is active.',
        merchantMessage: `Your TillFlow trial is active for the ${planName} plan.`,
        controlMessage: `Trial active for ${planName}.`,
        nextActionLabel: 'View billing',
        nextActionHref: '/settings/billing',
      };
    case 'TRIAL_DUE_SOON':
      return {
        displayStatus: 'Trial due soon',
        primaryBanner: `Your TillFlow trial has ${daysLabel} left.`,
        merchantMessage: `Your TillFlow trial has ${daysLabel} left on the ${planName} plan.`,
        controlMessage: `Trial ending soon for ${planName}.`,
        nextActionLabel: 'View billing',
        nextActionHref: '/settings/billing',
      };
    case 'TRIAL_DUE_TODAY':
      return {
        displayStatus: 'Trial ends today',
        primaryBanner: 'Your TillFlow trial ends today. Complete payment to continue without interruption.',
        merchantMessage: 'Your TillFlow trial ends today. Complete payment to continue without interruption.',
        controlMessage: `Trial expires today for ${planName}.`,
        nextActionLabel: 'View billing',
        nextActionHref: '/settings/billing',
      };
    case 'TRIAL_EXPIRED_GRACE':
      return {
        displayStatus: 'Trial expired - grace',
        primaryBanner: 'Your trial has ended. Complete payment before access is restricted.',
        merchantMessage: 'Your trial has ended. Complete payment before access is restricted.',
        controlMessage: `Trial expired for ${planName}; grace is still active.`,
        nextActionLabel: 'View billing',
        nextActionHref: '/settings/billing',
      };
    case 'TRIAL_RESTRICTED':
      return {
        displayStatus: 'Trial restricted',
        primaryBanner: 'Access restricted. Complete payment to continue using TillFlow.',
        merchantMessage: 'Access restricted. Complete payment to continue using TillFlow.',
        controlMessage: `Trial ended for ${planName}; access is restricted.`,
        nextActionLabel: 'View billing',
        nextActionHref: '/settings/billing',
      };
    case 'RENEWAL_DUE_SOON':
      return {
        displayStatus: 'Renewal due soon',
        primaryBanner: daysLabel ? `Your TillFlow plan renews in ${daysLabel}.` : null,
        merchantMessage: daysLabel ? `Your TillFlow plan renews in ${daysLabel}.` : `Your TillFlow plan renews on ${dueLabel}.`,
        controlMessage: daysLabel ? `Renewal due in ${daysLabel}.` : `Renewal scheduled for ${dueLabel}.`,
        nextActionLabel: 'View billing',
        nextActionHref: '/settings/billing',
      };
    case 'PAYMENT_DUE_TODAY':
      return {
        displayStatus: 'Payment due today',
        primaryBanner: 'Your TillFlow payment is due today.',
        merchantMessage: 'Your TillFlow payment is due today.',
        controlMessage: `Payment due today for ${planName}.`,
        nextActionLabel: 'View billing',
        nextActionHref: '/settings/billing',
      };
    case 'PAYMENT_OVERDUE_GRACE':
      return {
        displayStatus: 'Payment overdue - grace',
        primaryBanner: 'Payment is overdue. Complete payment to avoid restricted access.',
        merchantMessage: 'Payment is overdue. Complete payment to avoid restricted access.',
        controlMessage: `Payment overdue for ${planName}; grace is still active.`,
        nextActionLabel: 'View billing',
        nextActionHref: '/settings/billing',
      };
    case 'PAYMENT_RESTRICTED':
      return {
        displayStatus: 'Payment restricted',
        primaryBanner: 'Access restricted until payment is confirmed.',
        merchantMessage: 'Access restricted until payment is confirmed.',
        controlMessage: `Payment overdue for ${planName}; access is restricted.`,
        nextActionLabel: 'View billing',
        nextActionHref: '/settings/billing',
      };
    case 'CANCELLED':
      return {
        displayStatus: 'Cancelled',
        primaryBanner: 'Subscription cancelled. Contact Tishgroup to reactivate.',
        merchantMessage: 'Subscription cancelled. Contact Tishgroup to reactivate.',
        controlMessage: `Subscription cancelled for ${planName}.`,
        nextActionLabel: 'Contact Tishgroup',
        nextActionHref: '/settings/billing',
      };
    case 'READ_ONLY':
      return {
        displayStatus: 'Read only',
        primaryBanner: 'Access restricted until payment is confirmed.',
        merchantMessage: 'Access restricted until payment is confirmed.',
        controlMessage: `Read-only mode is active for ${planName}.`,
        nextActionLabel: 'View billing',
        nextActionHref: '/settings/billing',
      };
    case 'PAID_ACTIVE':
    default:
      return {
        displayStatus: 'Active',
        primaryBanner: null,
        merchantMessage: `Your TillFlow ${planName} plan is active until ${dueLabel}.`,
        controlMessage: `Paid access is active for ${planName}.`,
        nextActionLabel: 'View billing',
        nextActionHref: '/settings/billing',
      };
  }
}

export function computeBillingAccessState(input: SubscriptionInput & { today?: Date; timezone?: string | null }, now = new Date()): BillingAccessComputation {
  const selectedPlan = normalizePlan(input.selectedPlan ?? input.plan);
  const timezone = resolveBusinessTimeZone(input.timezone);
  const today = input.today ?? now;
  const billingInterval = normalizeInterval(input.billingInterval ?? input.billingCadence);
  const trialStartedAt = toDate(input.trialStartedAt);
  const trialEndsAt = resolveBillingDate(input, 'trialEndsAt');
  const firstPaymentAt = toDate(input.firstPaymentConfirmedAt ?? input.firstPaymentAt ?? input.lastPaymentRecordedAt ?? input.lastPaymentAt);
  const lastPaymentAt = toDate(input.lastPaymentRecordedAt ?? input.lastPaymentAt);
  const explicitStatus = String(input.subscriptionStatus ?? input.planStatus ?? '').toUpperCase();
  const rawCurrentPeriodEndsAt = resolveBillingDate(input, 'currentPeriodEndsAt');
  const nextBillingDate = normalizePaidNextBillingDate(
    toDate(input.nextBillingDate) ?? toDate(input.nextPaymentDueAt) ?? rawCurrentPeriodEndsAt,
    lastPaymentAt,
    billingInterval,
    explicitStatus
  );
  const currentPeriodStartedAt = normalizeCurrentPeriodStartedAt(
    toDate(input.currentPeriodStartedAt ?? input.currentPeriodStart),
    lastPaymentAt
  );
  const currentPeriodEndsAt = normalizeCurrentPeriodEndsAt(
    rawCurrentPeriodEndsAt,
    currentPeriodStartedAt,
    nextBillingDate
  );
  const paymentGraceEndsAt = resolveBillingDate(input, 'paymentGraceEndsAt');
  const suspendedAt = toDate(input.suspendedAt);
  const cancelledAt = toDate(input.cancelledAt);
  const billedAmount = normalizeBillingAmountPence(
    input.billingAmount,
    selectedPlan,
    billingInterval,
    input.addonOnlineStorefront
  );

  let accessState: BillingAccessState;
  let daysRemaining: number | null = null;

  if (cancelledAt || explicitStatus === 'CANCELLED' || explicitStatus === 'INACTIVE' || explicitStatus === 'DEACTIVATED') {
    accessState = 'CANCELLED';
  } else if (explicitStatus === 'READ_ONLY' || (suspendedAt && explicitStatus !== 'TRIAL_ACTIVE' && explicitStatus !== 'PAID_ACTIVE')) {
    accessState = 'READ_ONLY';
  } else if (explicitStatus === 'TRIAL_RESTRICTED' || explicitStatus === 'PAYMENT_RESTRICTED') {
    accessState = explicitStatus;
  } else if (!firstPaymentAt) {
    const trial = computeTrialState({ trialEndsAt, graceEndsAt: paymentGraceEndsAt, today, timeZone: timezone });
    accessState = trial.accessState;
    daysRemaining = trial.daysRemaining;
  } else {
    const paid = computePaidState({ dueDate: nextBillingDate, graceEndsAt: paymentGraceEndsAt, today, timeZone: timezone, billingInterval });
    accessState = paid.accessState;
    daysRemaining = paid.daysRemaining;
  }

  const isTrial = accessState.startsWith('TRIAL_');
  const isPaid = firstPaymentAt != null && !isTrial && accessState !== 'CANCELLED';
  const isRestricted = RESTRICTED_ACCESS_STATES.has(accessState);
  const isOverdue = ['TRIAL_EXPIRED_GRACE', 'TRIAL_RESTRICTED', 'PAYMENT_OVERDUE_GRACE', 'PAYMENT_RESTRICTED', 'READ_ONLY'].includes(accessState);
  const allowedFeatures = isRestricted ? RESTRICTED_ALLOWED_FEATURES : ALL_FEATURES;
  const restrictedFeatures = isRestricted ? RESTRICTED_FEATURES : [];
  const copy = resolveAccessCopy(accessState, selectedPlan, daysRemaining, nextBillingDate, trialEndsAt);

  return {
    selectedPlan,
    accessState,
    displayStatus: copy.displayStatus,
    daysRemaining,
    isTrial,
    isPaid,
    isOverdue,
    isRestricted,
    allowedFeatures,
    restrictedFeatures,
    primaryBanner: copy.primaryBanner,
    merchantMessage: copy.merchantMessage,
    controlMessage: copy.controlMessage,
    nextActionLabel: copy.nextActionLabel,
    nextActionHref: copy.nextActionHref,
    trialStartedAt,
    trialEndsAt,
    firstPaymentAt,
    currentPeriodStartedAt,
    currentPeriodEndsAt,
    nextBillingDate,
    lastPaymentAt,
    paymentGraceEndsAt,
    suspendedAt,
    cancelledAt,
    billingInterval,
    billingAmountPence: billedAmount,
    billingCurrency: 'GHS',
  };
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
  const nextBillingDate = computeBillingAccessState(input, now).nextBillingDate;
  return wholeDaysUntil(nextBillingDate, now);
}

export function getSubscriptionStatus(input: SubscriptionInput, now = new Date()): SubscriptionStatus {
  return computeBillingAccessState(input, now).accessState;
}

export function getSubscriptionSnapshot(input: SubscriptionInput, now = new Date()): SubscriptionSnapshot {
  const computation = computeBillingAccessState(input, now);

  return {
    selectedPlan: computation.selectedPlan,
    status: computation.accessState,
    accessState: computation.accessState,
    displayStatus: computation.displayStatus,
    trialStartedAt: computation.trialStartedAt,
    trialEndsAt: computation.trialEndsAt,
    firstPaymentAt: computation.firstPaymentAt,
    currentPeriodStartedAt: computation.currentPeriodStartedAt,
    currentPeriodEndsAt: computation.currentPeriodEndsAt,
    nextBillingDate: computation.nextBillingDate,
    lastPaymentAt: computation.lastPaymentAt,
    paymentGraceEndsAt: computation.paymentGraceEndsAt,
    suspendedAt: computation.suspendedAt,
    cancelledAt: computation.cancelledAt,
    daysLeftInTrial: getTrialDaysLeft(input, now),
    daysUntilBilling: getDaysUntilBilling(input, now),
    daysRemaining: computation.daysRemaining,
    billingInterval: computation.billingInterval,
    billingAmountPence: computation.billingAmountPence,
    billingCurrency: computation.billingCurrency,
    isRestricted: computation.isRestricted,
    canWrite: !computation.isRestricted,
    isTrial: computation.isTrial,
    isPaid: computation.isPaid,
    isOverdue: computation.isOverdue,
    allowedFeatures: computation.allowedFeatures,
    restrictedFeatures: computation.restrictedFeatures,
    primaryBanner: computation.primaryBanner,
    merchantMessage: computation.merchantMessage,
    controlMessage: computation.controlMessage,
    nextActionLabel: computation.nextActionLabel,
    nextActionHref: computation.nextActionHref,
  };
}

export function canUseFeature(feature: RestrictedFeature, input: SubscriptionInput, now = new Date()) {
  const snapshot = getSubscriptionSnapshot(input, now);
  return snapshot.allowedFeatures.includes(feature);
}

export function requireActiveSubscription(feature: RestrictedFeature, input: SubscriptionInput, now = new Date()) {
  if (!canUseFeature(feature, input, now)) {
    throw new Error('Your TillFlow subscription needs payment before this feature can continue.');
  }
}

export function activateSubscriptionAfterPayment(
  input: SubscriptionInput & { paymentDate?: Date; amountPence?: number | null }
) {
  const paymentDate = input.paymentDate ?? new Date();
  const billingInterval = normalizeInterval(input.billingInterval ?? input.billingCadence);
  const nextBillingDate = calculateNextBillingDate(paymentDate, billingInterval);
  const firstPaymentAt = toDate(input.firstPaymentAt) ?? paymentDate;
  const selectedPlan = normalizePlan(input.selectedPlan ?? input.plan);
  const pricing = computeSubscriptionPricing({
    plan: selectedPlan,
    addonOnlineStorefront: input.addonOnlineStorefront,
    billingInterval,
  });
  const defaultAmount = pricing.totalBillingAmount;

  return {
    subscriptionStatus: 'PAID_ACTIVE' as const,
    planStatus: 'PAID_ACTIVE',
    firstPaymentAt,
    currentPeriodStartedAt: paymentDate,
    currentPeriodEndsAt: nextBillingDate,
    nextBillingDate,
    nextPaymentDueAt: nextBillingDate,
    lastPaymentAt: paymentDate,
    paymentGraceEndsAt: null,
    suspendedAt: null,
    cancelledAt: null,
    billingAmount: input.amountPence ?? defaultAmount,
    billingCurrency: 'GHS',
    billingInterval,
  };
}

export function createTrialSubscription(
  plan: BusinessPlan,
  options?: { addonOnlineStorefront?: boolean; billingInterval?: string | null; now?: Date }
) {
  const now = options?.now ?? new Date();
  const trialEndsAt = addDays(now, TRIAL_DAYS);
  const addonOnlineStorefront = plan === 'GROWTH' && Boolean(options?.addonOnlineStorefront);
  const billingInterval = normalizeInterval(options?.billingInterval);
  const pricing = computeSubscriptionPricing({
    plan,
    addonOnlineStorefront,
    billingInterval,
  });

  return {
    plan,
    selectedPlan: plan,
    addonOnlineStorefront,
    planStatus: 'TRIAL_ACTIVE',
    subscriptionStatus: 'TRIAL_ACTIVE',
    trialStartedAt: now,
    trialEndsAt,
    planSetAt: now,
    billingAmount: pricing.totalBillingAmount,
    billingCurrency: 'GHS',
    billingInterval,
    nextBillingDate: null,
    nextPaymentDueAt: trialEndsAt,
  };
}

export function getMerchantSubscriptionMessage(input: SubscriptionInput, now = new Date()) {
  return computeBillingAccessState(input, now).merchantMessage;
}
