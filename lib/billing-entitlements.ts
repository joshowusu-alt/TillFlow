import { getBusinessPlan, type BusinessMode, type BusinessPlan, type StoreMode } from './features';

const DAY_MS = 24 * 60 * 60 * 1000;

export type BillingAccessState = 'ACTIVE' | 'TRIAL' | 'GRACE' | 'STARTER_FALLBACK' | 'READ_ONLY';

type BillingStatus = string | null | undefined;

type BillingBusinessInput = {
  plan?: BusinessPlan | null;
  mode?: BusinessMode | null;
  storeMode?: StoreMode | null;
  planStatus?: BillingStatus;
  trialEndsAt?: Date | string | null;
  nextPaymentDueAt?: Date | string | null;
  lastPaymentAt?: Date | string | null;
};

export type BillingEntitlement = {
  purchasedPlan: BusinessPlan;
  effectivePlan: BusinessPlan;
  accessState: BillingAccessState;
  canWrite: boolean;
  isReadOnly: boolean;
  statusLabel: string;
  trialEndsAt: Date | null;
  nextPaymentDueAt: Date | null;
  lastPaymentAt: Date | null;
  graceEndsAt: Date | null;
  starterFallbackEndsAt: Date | null;
  readOnlyAt: Date | null;
};

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function resolveGraceDays(plan: BusinessPlan) {
  if (plan === 'PRO') return 14;
  return 7;
}

function formatStatusLabel(state: BillingAccessState) {
  switch (state) {
    case 'TRIAL':
      return 'TRIAL';
    case 'GRACE':
      return 'GRACE';
    case 'STARTER_FALLBACK':
      return 'STARTER FALLBACK';
    case 'READ_ONLY':
      return 'READ ONLY';
    case 'ACTIVE':
    default:
      return 'ACTIVE';
  }
}

export function getBillingEntitlement(input: BillingBusinessInput, now = new Date()): BillingEntitlement {
  const purchasedPlan = getBusinessPlan(input.plan ?? input.mode, input.storeMode ?? 'SINGLE_STORE');
  const planStatus = String(input.planStatus ?? 'ACTIVE').toUpperCase();
  const trialEndsAt = toDate(input.trialEndsAt);
  const nextPaymentDueAt = toDate(input.nextPaymentDueAt);
  const lastPaymentAt = toDate(input.lastPaymentAt);

  if ((planStatus === 'INACTIVE' || planStatus === 'DEACTIVATED' || planStatus === 'CANCELLED') && purchasedPlan) {
    return {
      purchasedPlan,
      effectivePlan: 'STARTER',
      accessState: 'READ_ONLY',
      canWrite: false,
      isReadOnly: true,
      statusLabel: 'INACTIVE',
      trialEndsAt,
      nextPaymentDueAt,
      lastPaymentAt,
      graceEndsAt: null,
      starterFallbackEndsAt: null,
      readOnlyAt: null,
    };
  }

  if ((planStatus === 'SUSPENDED' || planStatus === 'READ_ONLY') && purchasedPlan) {
    return {
      purchasedPlan,
      effectivePlan: 'STARTER',
      accessState: 'READ_ONLY',
      canWrite: false,
      isReadOnly: true,
      statusLabel: 'READ ONLY',
      trialEndsAt,
      nextPaymentDueAt,
      lastPaymentAt,
      graceEndsAt: null,
      starterFallbackEndsAt: null,
      readOnlyAt: now,
    };
  }

  if (planStatus === 'TRIAL' && trialEndsAt && trialEndsAt.getTime() >= now.getTime()) {
    return {
      purchasedPlan,
      effectivePlan: purchasedPlan,
      accessState: 'TRIAL',
      canWrite: true,
      isReadOnly: false,
      statusLabel: 'TRIAL',
      trialEndsAt,
      nextPaymentDueAt,
      lastPaymentAt,
      graceEndsAt: null,
      starterFallbackEndsAt: null,
      readOnlyAt: null,
    };
  }

  if (!nextPaymentDueAt || nextPaymentDueAt.getTime() >= now.getTime()) {
    return {
      purchasedPlan,
      effectivePlan: purchasedPlan,
      accessState: 'ACTIVE',
      canWrite: true,
      isReadOnly: false,
      statusLabel: 'ACTIVE',
      trialEndsAt,
      nextPaymentDueAt,
      lastPaymentAt,
      graceEndsAt: null,
      starterFallbackEndsAt: null,
      readOnlyAt: null,
    };
  }

  const graceEndsAt = addDays(nextPaymentDueAt, resolveGraceDays(purchasedPlan));

  if (purchasedPlan === 'STARTER') {
    const accessState: BillingAccessState = now.getTime() <= graceEndsAt.getTime() ? 'GRACE' : 'READ_ONLY';

    return {
      purchasedPlan,
      effectivePlan: 'STARTER',
      accessState,
      canWrite: accessState !== 'READ_ONLY',
      isReadOnly: accessState === 'READ_ONLY',
      statusLabel: formatStatusLabel(accessState),
      trialEndsAt,
      nextPaymentDueAt,
      lastPaymentAt,
      graceEndsAt,
      starterFallbackEndsAt: null,
      readOnlyAt: graceEndsAt,
    };
  }

  const starterFallbackEndsAt = addDays(graceEndsAt, 7);

  if (now.getTime() <= graceEndsAt.getTime()) {
    return {
      purchasedPlan,
      effectivePlan: purchasedPlan,
      accessState: 'GRACE',
      canWrite: true,
      isReadOnly: false,
      statusLabel: 'GRACE',
      trialEndsAt,
      nextPaymentDueAt,
      lastPaymentAt,
      graceEndsAt,
      starterFallbackEndsAt,
      readOnlyAt: starterFallbackEndsAt,
    };
  }

  if (now.getTime() <= starterFallbackEndsAt.getTime()) {
    return {
      purchasedPlan,
      effectivePlan: 'STARTER',
      accessState: 'STARTER_FALLBACK',
      canWrite: true,
      isReadOnly: false,
      statusLabel: 'STARTER FALLBACK',
      trialEndsAt,
      nextPaymentDueAt,
      lastPaymentAt,
      graceEndsAt,
      starterFallbackEndsAt,
      readOnlyAt: starterFallbackEndsAt,
    };
  }

  return {
    purchasedPlan,
    effectivePlan: 'STARTER',
    accessState: 'READ_ONLY',
    canWrite: false,
    isReadOnly: true,
    statusLabel: 'READ ONLY',
    trialEndsAt,
    nextPaymentDueAt,
    lastPaymentAt,
    graceEndsAt,
    starterFallbackEndsAt,
    readOnlyAt: starterFallbackEndsAt,
  };
}
