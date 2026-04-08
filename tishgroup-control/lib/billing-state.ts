import type { ManagedPlan, ManagedState } from '@/lib/control-data';

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
  trialEndsAt?: Date | string | null;
  nextPaymentDueAt?: Date | string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const nextDueAt = toDate(input.nextPaymentDueAt);
  const trialEndsAt = toDate(input.trialEndsAt);
  const planStatus = String(input.planStatus ?? 'ACTIVE').toUpperCase();

  if ((planStatus === 'TRIAL' || planStatus === 'TRIALING') && trialEndsAt && trialEndsAt >= now) {
    return {
      state: 'TRIAL' as ManagedState,
      effectivePlan: input.plan,
      readOnlyAt: null,
    };
  }

  if (!nextDueAt) {
    return {
      state: 'ACTIVE' as ManagedState,
      effectivePlan: input.plan,
      readOnlyAt: null,
    };
  }

  const diffMs = nextDueAt.getTime() - now.getTime();
  if (diffMs >= 0 && diffMs <= 7 * DAY_MS) {
    return {
      state: 'DUE_SOON' as ManagedState,
      effectivePlan: input.plan,
      readOnlyAt: null,
    };
  }

  if (nextDueAt >= now) {
    return {
      state: 'ACTIVE' as ManagedState,
      effectivePlan: input.plan,
      readOnlyAt: null,
    };
  }

  const graceEndsAt = addDays(nextDueAt, resolveGraceDays(input.plan));
  if (input.plan === 'STARTER') {
    return {
      state: now <= graceEndsAt ? ('GRACE' as ManagedState) : ('READ_ONLY' as ManagedState),
      effectivePlan: 'STARTER' as ManagedPlan,
      readOnlyAt: graceEndsAt,
    };
  }

  if (now <= graceEndsAt) {
    return {
      state: 'GRACE' as ManagedState,
      effectivePlan: input.plan,
      readOnlyAt: addDays(graceEndsAt, 7),
    };
  }

  const fallbackEndsAt = addDays(graceEndsAt, 7);
  if (now <= fallbackEndsAt) {
    return {
      state: 'STARTER_FALLBACK' as ManagedState,
      effectivePlan: 'STARTER' as ManagedPlan,
      readOnlyAt: fallbackEndsAt,
    };
  }

  return {
    state: 'READ_ONLY' as ManagedState,
    effectivePlan: 'STARTER' as ManagedPlan,
    readOnlyAt: fallbackEndsAt,
  };
}