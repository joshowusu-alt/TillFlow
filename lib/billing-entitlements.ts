import { getBusinessPlan, type BusinessMode, type BusinessPlan, type StoreMode } from './features';
import {
  getSubscriptionSnapshot,
  type SubscriptionInput,
  type SubscriptionStatus,
} from './subscription-lifecycle';

export type BillingAccessState = 'ACTIVE' | 'TRIAL' | 'GRACE' | 'READ_ONLY';

type BillingBusinessInput = SubscriptionInput & {
  plan?: BusinessPlan | null;
  mode?: BusinessMode | null;
  storeMode?: StoreMode | null;
};

export type BillingEntitlement = {
  purchasedPlan: BusinessPlan;
  effectivePlan: BusinessPlan;
  subscriptionStatus: SubscriptionStatus;
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
  daysLeftInTrial: number | null;
  daysUntilBilling: number | null;
  billingAmountPence: number;
};

function accessStateFor(status: SubscriptionStatus): BillingAccessState {
  if (status === 'TRIAL_ACTIVE' || status === 'TRIAL_EXPIRING_SOON') return 'TRIAL';
  if (status === 'GRACE_PERIOD' || status === 'PAYMENT_PENDING' || status === 'TRIAL_ENDED' || status === 'OVERDUE') return 'GRACE';
  if (status === 'SUSPENDED' || status === 'CANCELLED') return 'READ_ONLY';
  return 'ACTIVE';
}

function labelFor(status: SubscriptionStatus) {
  switch (status) {
    case 'TRIAL_ACTIVE':
      return 'TRIAL ACTIVE';
    case 'TRIAL_EXPIRING_SOON':
      return 'TRIAL EXPIRING SOON';
    case 'TRIAL_ENDED':
      return 'TRIAL ENDED';
    case 'PAYMENT_PENDING':
      return 'PAYMENT PENDING';
    case 'DUE_SOON':
      return 'DUE SOON';
    case 'DUE_TODAY':
      return 'DUE TODAY';
    case 'GRACE_PERIOD':
      return 'GRACE PERIOD';
    default:
      return status.replace(/_/g, ' ');
  }
}

export function getBillingEntitlement(input: BillingBusinessInput, now = new Date()): BillingEntitlement {
  const purchasedPlan = getBusinessPlan((input.selectedPlan ?? input.plan ?? input.mode) as BusinessPlan | BusinessMode | null | undefined, input.storeMode ?? 'SINGLE_STORE');
  const snapshot = getSubscriptionSnapshot({ ...input, selectedPlan: purchasedPlan }, now);
  const accessState = accessStateFor(snapshot.status);
  const isReadOnly = accessState === 'READ_ONLY';

  return {
    purchasedPlan,
    effectivePlan: purchasedPlan,
    subscriptionStatus: snapshot.status,
    accessState,
    canWrite: !isReadOnly,
    isReadOnly,
    statusLabel: labelFor(snapshot.status),
    trialEndsAt: snapshot.trialEndsAt,
    nextPaymentDueAt: snapshot.nextBillingDate,
    lastPaymentAt: snapshot.lastPaymentAt,
    graceEndsAt: snapshot.paymentGraceEndsAt,
    starterFallbackEndsAt: null,
    readOnlyAt: snapshot.suspendedAt ?? snapshot.paymentGraceEndsAt,
    daysLeftInTrial: snapshot.daysLeftInTrial,
    daysUntilBilling: snapshot.daysUntilBilling,
    billingAmountPence: snapshot.billingAmountPence,
  };
}
