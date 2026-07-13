import {
  ACTIVATION_STEP_DEFINITIONS,
  MIN_SALES_FOR_HEALTHY_WEEK,
  type ActivationStepDefinition,
  type ActivationStepKey,
  type ActivationStepStatus,
} from './activation-steps';
import {
  computeBillingAccessState,
  type BillingAccessState,
  type SubscriptionInput,
} from './subscription-lifecycle';
import {
  computeOnboardingJourney,
  getJourneyProgressPercent,
  hasBusinessName,
  hasBusinessType,
  hasFirstSale,
  hasSellableProduct,
  hasValidProduct,
  isReadyToSell,
  type OnboardingJourneySnapshot,
} from './onboarding-journey';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type ActivationReadinessStatus =
  | 'GETTING_STARTED'
  | 'SETUP_IN_PROGRESS'
  | 'READY_TO_SELL'
  | 'ACTIVE_BUSINESS'
  | 'NEEDS_HELP'
  | 'STUCK';

/** Stuck reasons remain for Control/billing alerts — never primary owner onboarding UX. */
export type ActivationStuckReason =
  | 'STUCK_NO_PRODUCTS'
  | 'STUCK_NO_STOCK'
  | 'STUCK_NO_SALE'
  | 'STUCK_NO_REPORT'
  | 'STUCK_TRIAL_LOW_USAGE'
  | 'PAYMENT_OVERDUE'
  | 'SUPPORT_ISSUE_UNRESOLVED'
  | 'CHURN_RISK'
  | null;

export type ActivationStepResult = {
  key: ActivationStepKey;
  title: string;
  explanation: string;
  href: string;
  status: ActivationStepStatus;
  done: boolean;
};

export type ActivationReadinessResult = {
  activationStatus: ActivationReadinessStatus;
  setupProgressPercent: number;
  completedSteps: ActivationStepKey[];
  missingSteps: ActivationStepKey[];
  steps: ActivationStepResult[];
  stuckReason: ActivationStuckReason;
  nextAction: string;
  controlMessage: string;
  ownerMessage: string;
  onboardingStage: string;
  isActivated: boolean;
  isHealthy: boolean;
  churnRisk: boolean;
  billingAccessState: BillingAccessState;
  nextStep: ActivationStepResult | null;
};

export type ActivationBusinessSnapshot = {
  businessId: string;
  isDemo?: boolean;
  createdAt: Date;
  name: string;
  address: string | null;
  phone: string | null;
  businessCategory: string | null;
  selectedPlan: string | null;
  addonOnlineStorefront?: boolean;
  momoEnabled: boolean;
  momoNumber: string | null;
  openingCapitalPence: number;
  onboardingCompletedAt: Date | null;
  ownerLastDashboardViewAt: Date | null;
  ownerLastReportViewAt: Date | null;
  trialAcknowledgedAt: Date | null;
  productCount: number;
  /** Active + sellingPriceBasePence > 0 */
  validProductCount: number;
  /** Valid + on-hand qty > 0 */
  sellableProductCount: number;
  inventoryOnHandBase: number;
  staffCount: number;
  purchaseCount: number;
  saleCount: number;
  salesLast7Days: number;
  lastSaleAt: Date | null;
  openSupportIssueCount: number;
  hasCriticalSupportIssue: boolean;
  ownerLastLoginAt: Date | null;
  subscription: SubscriptionInput;
  now?: Date;
};

function hoursSince(from: Date, now: Date) {
  return (now.getTime() - from.getTime()) / HOUR_MS;
}

function daysSince(from: Date, now: Date) {
  return hoursSince(from, now) / 24;
}

function toJourneySnapshot(snapshot: ActivationBusinessSnapshot): OnboardingJourneySnapshot {
  return {
    name: snapshot.name,
    businessCategory: snapshot.businessCategory,
    validProductCount: snapshot.validProductCount,
    sellableProductCount: snapshot.sellableProductCount,
    productCount: snapshot.productCount,
    saleCount: snapshot.saleCount,
    onboardingCompletedAt: snapshot.onboardingCompletedAt,
  };
}

function evaluateStep(
  key: ActivationStepKey,
  snapshot: ActivationBusinessSnapshot
): { done: boolean; status: ActivationStepStatus } {
  const journey = toJourneySnapshot(snapshot);
  const doneByKey: Record<ActivationStepKey, boolean> = {
    business: hasBusinessName(journey) && hasBusinessType(journey),
    products: hasValidProduct(journey),
    stock: hasSellableProduct(journey),
    selling: hasFirstSale(journey),
    complete: Boolean(snapshot.onboardingCompletedAt) || hasFirstSale(journey),
  };

  const done = doneByKey[key];
  if (done) return { done: true, status: 'done' };

  const startedHints: Partial<Record<ActivationStepKey, boolean>> = {
    business: hasBusinessName(journey) || hasBusinessType(journey),
    products: snapshot.productCount > 0 && !hasValidProduct(journey),
    stock: hasValidProduct(journey) && !hasSellableProduct(journey),
    selling: isReadyToSell(journey) && !hasFirstSale(journey),
  };

  if (startedHints[key]) return { done: false, status: 'in_progress' };
  return { done: false, status: 'not_started' };
}

export function buildActivationSteps(snapshot: ActivationBusinessSnapshot): ActivationStepResult[] {
  return ACTIVATION_STEP_DEFINITIONS.map((def: ActivationStepDefinition) => {
    const { done, status } = evaluateStep(def.key, snapshot);
    return {
      key: def.key,
      title: def.title,
      explanation: def.explanation,
      href: def.href,
      status,
      done,
    };
  });
}

export function getSetupProgressPercent(steps: ActivationStepResult[]): number {
  const counted = steps.filter((step) => {
    const def = ACTIVATION_STEP_DEFINITIONS.find((d) => d.key === step.key);
    return def?.countsTowardProgress;
  });
  if (counted.length === 0) return 100;
  const doneCount = counted.filter((s) => s.done).length;
  return Math.round((doneCount / counted.length) * 100);
}

/**
 * Control-plane / billing alerts only. Owner onboarding UI must not show "Stuck".
 */
export function detectStuckReason(
  snapshot: ActivationBusinessSnapshot,
  _steps: ActivationStepResult[],
  billingAccessState: BillingAccessState,
  now: Date
): ActivationStuckReason {
  if (snapshot.hasCriticalSupportIssue || snapshot.openSupportIssueCount > 0) {
    return 'SUPPORT_ISSUE_UNRESOLVED';
  }

  if (
    ['PAYMENT_OVERDUE_GRACE', 'PAYMENT_RESTRICTED', 'TRIAL_RESTRICTED'].includes(billingAccessState)
  ) {
    return 'PAYMENT_OVERDUE';
  }

  // Soft operational signals for Control — not owner checklist blockers.
  const ageHours = hoursSince(snapshot.createdAt, now);
  if (ageHours >= 24 && snapshot.validProductCount === 0) {
    return 'STUCK_NO_PRODUCTS';
  }
  if (snapshot.validProductCount > 0 && ageHours >= 24 && snapshot.sellableProductCount === 0) {
    return 'STUCK_NO_STOCK';
  }
  if (snapshot.sellableProductCount > 0 && ageHours >= 48 && snapshot.saleCount === 0) {
    return 'STUCK_NO_SALE';
  }

  const billing = computeBillingAccessState(snapshot.subscription, now);
  const trialEndsAt = billing.trialEndsAt;
  if (trialEndsAt && !billing.firstPaymentAt) {
    const daysToTrialEnd = (trialEndsAt.getTime() - now.getTime()) / DAY_MS;
    if (daysToTrialEnd <= 3 && daysToTrialEnd >= 0 && snapshot.saleCount < 5) {
      return 'STUCK_TRIAL_LOW_USAGE';
    }
  }

  if (computeChurnRisk(snapshot, billingAccessState, now)) {
    return 'CHURN_RISK';
  }

  return null;
}

export function computeChurnRisk(
  snapshot: ActivationBusinessSnapshot,
  billingAccessState: BillingAccessState,
  now: Date
): boolean {
  if (snapshot.isDemo === true) return false;

  const noLogin7d =
    snapshot.ownerLastLoginAt != null && daysSince(snapshot.ownerLastLoginAt, now) >= 7;
  const noSales7d =
    snapshot.lastSaleAt == null ||
    (snapshot.lastSaleAt != null && daysSince(snapshot.lastSaleAt, now) >= 7);
  const lowWeeklySales =
    snapshot.salesLast7Days < MIN_SALES_FOR_HEALTHY_WEEK && snapshot.saleCount > 0;
  const trialEndingSoon =
    billingAccessState === 'TRIAL_DUE_SOON' || billingAccessState === 'TRIAL_DUE_TODAY';
  const lowUsageTrial = trialEndingSoon && snapshot.saleCount < 5;

  return (
    noLogin7d ||
    (noSales7d && snapshot.saleCount > 0) ||
    lowWeeklySales ||
    lowUsageTrial ||
    snapshot.hasCriticalSupportIssue
  );
}

export function isBusinessActivated(snapshot: ActivationBusinessSnapshot): boolean {
  return hasFirstSale(toJourneySnapshot(snapshot)) || Boolean(snapshot.onboardingCompletedAt);
}

export function isBusinessHealthy(
  snapshot: ActivationBusinessSnapshot,
  billingAccessState: BillingAccessState
): boolean {
  if (['PAYMENT_RESTRICTED', 'TRIAL_RESTRICTED', 'CANCELLED', 'READ_ONLY'].includes(billingAccessState)) {
    return false;
  }
  if (snapshot.hasCriticalSupportIssue) return false;
  if (snapshot.salesLast7Days < MIN_SALES_FOR_HEALTHY_WEEK) return false;
  if (!hasFirstSale(toJourneySnapshot(snapshot))) return false;
  return true;
}

export function resolveActivationStatus(
  snapshot: ActivationBusinessSnapshot,
  _steps: ActivationStepResult[],
  stuckReason: ActivationStuckReason,
  _billingAccessState: BillingAccessState,
  setupProgressPercent: number
): ActivationReadinessStatus {
  // Billing/support only — never surface STUCK for ordinary setup gaps.
  if (stuckReason === 'PAYMENT_OVERDUE' || stuckReason === 'SUPPORT_ISSUE_UNRESOLVED') {
    return 'NEEDS_HELP';
  }

  const journey = toJourneySnapshot(snapshot);
  if (hasFirstSale(journey) || snapshot.onboardingCompletedAt) {
    return 'ACTIVE_BUSINESS';
  }
  if (isReadyToSell(journey)) {
    return 'READY_TO_SELL';
  }
  if (setupProgressPercent > 0) {
    return 'SETUP_IN_PROGRESS';
  }
  return 'GETTING_STARTED';
}

function stuckReasonCopy(reason: ActivationStuckReason): { next: string; control: string; owner: string } {
  switch (reason) {
    case 'STUCK_NO_PRODUCTS':
      return {
        next: 'Help add or import products',
        control: 'No valid products 24h after signup.',
        owner: 'Add or import at least one product with a selling price.',
      };
    case 'STUCK_NO_STOCK':
      return {
        next: 'Help add stock to one product',
        control: 'Products added but none sellable after 24h.',
        owner: 'Add stock to at least one product to make your first sale. You can complete the rest later.',
      };
    case 'STUCK_NO_SALE':
      return {
        next: 'Help complete first sale',
        control: 'Sellable stock present but no sale after 48h.',
        owner: 'Open POS and make your first successful sale when you are ready.',
      };
    case 'STUCK_TRIAL_LOW_USAGE':
      return {
        next: 'Trial ending — low usage follow-up',
        control: 'Trial ending within 3 days with fewer than 5 sales.',
        owner: 'Your trial is ending soon. Make a few more sales or contact us for setup help.',
      };
    case 'PAYMENT_OVERDUE':
      return {
        next: 'Confirm payment or extend grace',
        control: 'Billing restricted or overdue — payment follow-up required.',
        owner: 'Your account needs payment to keep selling. Open Billing.',
      };
    case 'SUPPORT_ISSUE_UNRESOLVED':
      return {
        next: 'Resolve open support issue',
        control: 'Open support issue — prioritise resolution.',
        owner: 'We are helping with your support request.',
      };
    case 'CHURN_RISK':
      return {
        next: 'Proactive retention check-in',
        control: 'Churn risk flags raised — schedule owner call.',
        owner: 'We noticed low activity. Open TillFlow if you need help.',
      };
    default:
      return {
        next: 'Continue setup',
        control: 'Onboarding in progress.',
        owner: 'Continue the four setup stages to get ready to sell.',
      };
  }
}

export function computeActivationReadiness(
  snapshot: ActivationBusinessSnapshot
): ActivationReadinessResult {
  const now = snapshot.now ?? new Date();
  const billing = computeBillingAccessState(snapshot.subscription, now);
  const steps = buildActivationSteps(snapshot);
  const journeySnap = toJourneySnapshot(snapshot);
  const journey = computeOnboardingJourney(journeySnap);
  const setupProgressPercent = getJourneyProgressPercent(journeySnap);
  const stuckReason = detectStuckReason(snapshot, steps, billing.accessState, now);
  const activationStatus = resolveActivationStatus(
    snapshot,
    steps,
    stuckReason,
    billing.accessState,
    setupProgressPercent
  );

  const completedSteps = steps.filter((s) => s.done).map((s) => s.key);
  const missingSteps = steps.filter((s) => !s.done && s.key !== 'complete').map((s) => s.key);
  const nextStep = steps.find((s) => !s.done && s.key !== 'complete') ?? null;

  // Persist full stuckReason for Control. Owner UI filters via getStuckReasonMessage / banner.
  const copy = journey.upNext
    ? {
        next: journey.upNext.title,
        control: stuckReason
          ? stuckReasonCopy(stuckReason).control
          : `Next setup step: ${journey.upNext.title}`,
        owner:
          stuckReason === 'PAYMENT_OVERDUE' || stuckReason === 'SUPPORT_ISSUE_UNRESOLVED'
            ? stuckReasonCopy(stuckReason).owner
            : journey.upNext.explanation,
      }
    : stuckReasonCopy(stuckReason);

  const onboardingStage = resolveOnboardingStageFixed(snapshot, billing.accessState);
  const churnRisk = computeChurnRisk(snapshot, billing.accessState, now);

  return {
    activationStatus,
    setupProgressPercent,
    completedSteps,
    missingSteps,
    steps,
    stuckReason,
    nextAction: copy.next,
    controlMessage: stuckReason ? stuckReasonCopy(stuckReason).control : copy.control,
    ownerMessage: copy.owner,
    onboardingStage,
    isActivated: isBusinessActivated(snapshot),
    isHealthy: isBusinessHealthy(snapshot, billing.accessState),
    churnRisk,
    billingAccessState: billing.accessState,
    nextStep,
  };
}

function resolveOnboardingStageFixed(
  snapshot: ActivationBusinessSnapshot,
  billingAccessState: BillingAccessState
): string {
  if (billingAccessState === 'PAID_ACTIVE') return 'paid_active';
  const billing = computeBillingAccessState(snapshot.subscription, snapshot.now ?? new Date());
  if (billing.firstPaymentAt) return 'paid_active';

  const journey = toJourneySnapshot(snapshot);
  if (!hasBusinessName(journey) || !hasBusinessType(journey)) return 'signed_up';
  if (!hasValidProduct(journey)) return 'profile_completed';
  if (!hasSellableProduct(journey)) return 'products_added';
  if (!hasFirstSale(journey)) return 'stock_added';
  return 'first_sale_completed';
}
