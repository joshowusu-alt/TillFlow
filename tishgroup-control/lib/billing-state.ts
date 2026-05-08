import type { ManagedPlan, ManagedState } from '@/lib/control-data';
import { getSubscriptionSnapshot } from '../../lib/subscription-lifecycle';

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveGraceDays(plan: ManagedPlan) {
  return plan === 'PRO' ? 14 : 7;
}

export function deriveManagedState(input: {
  plan: ManagedPlan;
  planStatus?: string | null;
  subscriptionStatus?: string | null;
  trialStartedAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
  firstPaymentAt?: Date | string | null;
  currentPeriodEndsAt?: Date | string | null;
  nextBillingDate?: Date | string | null;
  paymentGraceEndsAt?: Date | string | null;
  suspendedAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  nextPaymentDueAt?: Date | string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const snapshot = getSubscriptionSnapshot({
    selectedPlan: input.plan,
    plan: input.plan,
    planStatus: input.planStatus,
    subscriptionStatus: input.subscriptionStatus,
    trialStartedAt: input.trialStartedAt,
    trialEndsAt: input.trialEndsAt,
    firstPaymentAt: input.firstPaymentAt,
    currentPeriodEndsAt: input.currentPeriodEndsAt,
    nextBillingDate: input.nextBillingDate,
    nextPaymentDueAt: input.nextPaymentDueAt,
    paymentGraceEndsAt: input.paymentGraceEndsAt,
    suspendedAt: input.suspendedAt,
    cancelledAt: input.cancelledAt,
  }, now);

  return {
    state: snapshot.status as ManagedState,
    effectivePlan: snapshot.isRestricted ? ('STARTER' as ManagedPlan) : input.plan,
    readOnlyAt: snapshot.suspendedAt ?? snapshot.paymentGraceEndsAt,
    daysLeft: snapshot.daysLeftInTrial ?? snapshot.daysUntilBilling,
  };

}
