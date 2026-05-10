import { getBusinessPlan, type BusinessMode, type BusinessPlan, type StoreMode } from './features';
import {
  computeBillingAccessState,
  getSubscriptionSnapshot,
  type SubscriptionInput,
  type BillingAccessState,
} from './subscription-lifecycle';

type BillingBusinessInput = SubscriptionInput & {
  plan?: BusinessPlan | null;
  mode?: BusinessMode | null;
  storeMode?: StoreMode | null;
  timezone?: string | null;
};

export type BillingEntitlement = {
  purchasedPlan: BusinessPlan;
  effectivePlan: BusinessPlan;
  subscriptionStatus: BillingAccessState;
  accessState: BillingAccessState;
  canWrite: boolean;
  isReadOnly: boolean;
  statusLabel: string;
  displayStatus: string;
  daysRemaining: number | null;
  isTrial: boolean;
  isPaid: boolean;
  isOverdue: boolean;
  trialEndsAt: Date | null;
  nextPaymentDueAt: Date | null;
  lastPaymentAt: Date | null;
  graceEndsAt: Date | null;
  starterFallbackEndsAt: Date | null;
  readOnlyAt: Date | null;
  daysLeftInTrial: number | null;
  daysUntilBilling: number | null;
  billingAmountPence: number;
  primaryBanner: string | null;
  merchantMessage: string;
  controlMessage: string;
  nextActionLabel: string;
  nextActionHref: string;
};

function labelFor(status: BillingAccessState) {
  return status.replace(/_/g, ' ');
}

export function getBillingEntitlement(input: BillingBusinessInput, now = new Date()): BillingEntitlement {
  const purchasedPlan = getBusinessPlan((input.selectedPlan ?? input.plan ?? input.mode) as BusinessPlan | BusinessMode | null | undefined, input.storeMode ?? 'SINGLE_STORE');
  const computation = computeBillingAccessState({ ...input, selectedPlan: purchasedPlan }, now);
  const snapshot = getSubscriptionSnapshot({ ...input, selectedPlan: purchasedPlan }, now);
  const accessState = computation.accessState;
  const isReadOnly = computation.isRestricted;

  return {
    purchasedPlan,
    effectivePlan: purchasedPlan,
    subscriptionStatus: accessState,
    accessState,
    canWrite: !isReadOnly,
    isReadOnly,
    statusLabel: labelFor(accessState),
    displayStatus: computation.displayStatus,
    daysRemaining: computation.daysRemaining,
    isTrial: computation.isTrial,
    isPaid: computation.isPaid,
    isOverdue: computation.isOverdue,
    trialEndsAt: snapshot.trialEndsAt,
    nextPaymentDueAt: snapshot.nextBillingDate,
    lastPaymentAt: snapshot.lastPaymentAt,
    graceEndsAt: snapshot.paymentGraceEndsAt,
    starterFallbackEndsAt: null,
    readOnlyAt: snapshot.suspendedAt ?? snapshot.paymentGraceEndsAt,
    daysLeftInTrial: snapshot.daysLeftInTrial,
    daysUntilBilling: snapshot.daysUntilBilling,
    billingAmountPence: snapshot.billingAmountPence,
    primaryBanner: computation.primaryBanner,
    merchantMessage: computation.merchantMessage,
    controlMessage: computation.controlMessage,
    nextActionLabel: computation.nextActionLabel,
    nextActionHref: computation.nextActionHref,
  };
}
