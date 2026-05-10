import type { ManagedPlan, ManagedState } from '@/lib/control-data';
import { computeBillingAccessState } from '@/lib/subscription-lifecycle';

export function deriveManagedState(input: {
  plan: ManagedPlan;
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
  now?: Date;
}) {
  const snapshot = computeBillingAccessState({
    selectedPlan: input.plan,
    plan: input.plan,
    planStatus: input.planStatus,
    subscriptionStatus: input.subscriptionStatus,
    trialStartedAt: input.trialStartedAt,
    trialEndsAt: input.trialEndsAt,
    firstPaymentAt: input.firstPaymentAt,
    currentPeriodStartedAt: input.currentPeriodStartedAt,
    currentPeriodEndsAt: input.currentPeriodEndsAt,
    nextBillingDate: input.nextBillingDate,
    nextPaymentDueAt: input.nextPaymentDueAt,
    lastPaymentAt: input.lastPaymentAt,
    paymentGraceEndsAt: input.paymentGraceEndsAt,
    suspendedAt: input.suspendedAt,
    cancelledAt: input.cancelledAt,
    billingCadence: input.billingCadence,
    timezone: input.timezone,
  }, input.now ?? new Date());

  return {
    state: snapshot.accessState as ManagedState,
    effectivePlan: snapshot.isRestricted ? ('STARTER' as ManagedPlan) : input.plan,
    readOnlyAt: snapshot.suspendedAt ?? (snapshot.isRestricted ? snapshot.paymentGraceEndsAt : null),
    daysLeft: snapshot.daysRemaining,
    displayStatus: snapshot.displayStatus,
    controlMessage: snapshot.controlMessage,
    isRestricted: snapshot.isRestricted,
    isOverdue: snapshot.isOverdue,
  };
}
