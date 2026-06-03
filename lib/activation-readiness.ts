import {
  ACTIVATION_STEP_DEFINITIONS,
  MIN_PRODUCTS_FOR_ACTIVATION,
  MIN_PRODUCTS_FOR_PROGRESS,
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

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type ActivationReadinessStatus =
  | 'GETTING_STARTED'
  | 'SETUP_IN_PROGRESS'
  | 'READY_TO_SELL'
  | 'ACTIVE_BUSINESS'
  | 'NEEDS_HELP'
  | 'STUCK';

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
  momoEnabled: boolean;
  momoNumber: string | null;
  openingCapitalPence: number;
  onboardingCompletedAt: Date | null;
  ownerLastDashboardViewAt: Date | null;
  ownerLastReportViewAt: Date | null;
  trialAcknowledgedAt: Date | null;
  productCount: number;
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

function hasProfileComplete(snapshot: ActivationBusinessSnapshot) {
  return Boolean(snapshot.name?.trim() && (snapshot.address?.trim() || snapshot.phone?.trim()));
}

function hasBusinessType(snapshot: ActivationBusinessSnapshot) {
  return Boolean(snapshot.businessCategory?.trim());
}

function hasPlan(snapshot: ActivationBusinessSnapshot) {
  return Boolean(snapshot.selectedPlan?.trim());
}

function hasStaff(snapshot: ActivationBusinessSnapshot) {
  return snapshot.staffCount > 1;
}

function hasProducts(snapshot: ActivationBusinessSnapshot) {
  return snapshot.productCount >= MIN_PRODUCTS_FOR_PROGRESS;
}

function hasOpeningStock(snapshot: ActivationBusinessSnapshot) {
  return (
    snapshot.openingCapitalPence > 0 ||
    snapshot.purchaseCount > 0 ||
    snapshot.inventoryOnHandBase > 0
  );
}

function hasPaymentsConfigured(snapshot: ActivationBusinessSnapshot) {
  return (snapshot.momoEnabled && Boolean(snapshot.momoNumber?.trim())) || snapshot.saleCount > 0;
}

function hasFirstPurchase(snapshot: ActivationBusinessSnapshot) {
  return snapshot.purchaseCount > 0;
}

function hasFirstSale(snapshot: ActivationBusinessSnapshot) {
  return snapshot.saleCount > 0;
}

function hasFirstReport(snapshot: ActivationBusinessSnapshot) {
  return Boolean(snapshot.ownerLastDashboardViewAt || snapshot.ownerLastReportViewAt);
}

function hasTrialPaymentAck(snapshot: ActivationBusinessSnapshot) {
  return Boolean(snapshot.trialAcknowledgedAt);
}

function hasSetupComplete(snapshot: ActivationBusinessSnapshot) {
  return Boolean(snapshot.onboardingCompletedAt);
}

function evaluateStep(
  key: ActivationStepKey,
  snapshot: ActivationBusinessSnapshot
): { done: boolean; status: ActivationStepStatus } {
  const doneByKey: Record<ActivationStepKey, boolean> = {
    profile: hasProfileComplete(snapshot),
    'business-type': hasBusinessType(snapshot),
    plan: hasPlan(snapshot),
    staff: hasStaff(snapshot),
    products: hasProducts(snapshot),
    'opening-stock': hasOpeningStock(snapshot),
    payments: hasPaymentsConfigured(snapshot),
    'first-purchase': hasFirstPurchase(snapshot),
    'first-sale': hasFirstSale(snapshot),
    'first-report': hasFirstReport(snapshot),
    'trial-payment': hasTrialPaymentAck(snapshot),
    complete: hasSetupComplete(snapshot),
  };

  const done = doneByKey[key];
  if (done) return { done: true, status: 'done' };

  const startedHints: Partial<Record<ActivationStepKey, boolean>> = {
    profile: Boolean(snapshot.phone || snapshot.address),
    'business-type': false,
    products: snapshot.productCount > 0 && snapshot.productCount < MIN_PRODUCTS_FOR_PROGRESS,
    'opening-stock': snapshot.productCount > 0 && !hasOpeningStock(snapshot),
    staff: snapshot.staffCount === 1,
    payments: snapshot.momoEnabled && !snapshot.momoNumber,
    'first-sale': hasOpeningStock(snapshot) && !hasFirstSale(snapshot),
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

export function detectStuckReason(
  snapshot: ActivationBusinessSnapshot,
  steps: ActivationStepResult[],
  billingAccessState: BillingAccessState,
  now: Date
): ActivationStuckReason {
  if (snapshot.hasCriticalSupportIssue) {
    return 'SUPPORT_ISSUE_UNRESOLVED';
  }
  if (snapshot.openSupportIssueCount > 0) {
    return 'SUPPORT_ISSUE_UNRESOLVED';
  }

  if (
    ['PAYMENT_OVERDUE_GRACE', 'PAYMENT_RESTRICTED', 'TRIAL_RESTRICTED'].includes(billingAccessState)
  ) {
    return 'PAYMENT_OVERDUE';
  }

  const ageHours = hoursSince(snapshot.createdAt, now);

  if (ageHours >= 24 && snapshot.productCount === 0) {
    return 'STUCK_NO_PRODUCTS';
  }

  const productsDone = steps.find((s) => s.key === 'products')?.done;
  if (productsDone && ageHours >= 24 && !hasOpeningStock(snapshot)) {
    return 'STUCK_NO_STOCK';
  }

  if (hasOpeningStock(snapshot) && ageHours >= 48 && !hasFirstSale(snapshot)) {
    return 'STUCK_NO_SALE';
  }

  if (hasFirstSale(snapshot)) {
    const firstSaleAgeDays = snapshot.lastSaleAt ? daysSince(snapshot.lastSaleAt, now) : 0;
    if (firstSaleAgeDays >= 3 && !hasFirstReport(snapshot)) {
      return 'STUCK_NO_REPORT';
    }
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
  const lowWeeklySales = snapshot.salesLast7Days < MIN_SALES_FOR_HEALTHY_WEEK && snapshot.saleCount > 0;
  const trialEndingSoon =
    billingAccessState === 'TRIAL_DUE_SOON' || billingAccessState === 'TRIAL_DUE_TODAY';
  const lowUsageTrial = trialEndingSoon && snapshot.saleCount < 5;
  const importIncomplete = snapshot.productCount > 0 && snapshot.productCount < MIN_PRODUCTS_FOR_ACTIVATION;
  const noDashboard =
    !snapshot.ownerLastDashboardViewAt ||
    daysSince(snapshot.ownerLastDashboardViewAt, now) >= 7;

  return (
    noLogin7d ||
    (noSales7d && snapshot.saleCount > 0) ||
    lowWeeklySales ||
    lowUsageTrial ||
    importIncomplete ||
    noDashboard ||
    snapshot.hasCriticalSupportIssue
  );
}

export function isBusinessActivated(snapshot: ActivationBusinessSnapshot): boolean {
  return (
    hasProfileComplete(snapshot) &&
    snapshot.productCount >= MIN_PRODUCTS_FOR_ACTIVATION &&
    hasOpeningStock(snapshot) &&
    hasStaff(snapshot) &&
    hasFirstSale(snapshot) &&
    hasFirstReport(snapshot)
  );
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
  if (snapshot.productCount < MIN_PRODUCTS_FOR_ACTIVATION) return false;
  if (!snapshot.ownerLastDashboardViewAt) return false;
  const now = snapshot.now ?? new Date();
  if (daysSince(snapshot.ownerLastDashboardViewAt, now) >= 7) return false;
  return true;
}

export function resolveActivationStatus(
  snapshot: ActivationBusinessSnapshot,
  steps: ActivationStepResult[],
  stuckReason: ActivationStuckReason,
  billingAccessState: BillingAccessState,
  setupProgressPercent: number
): ActivationReadinessStatus {
  if (stuckReason && stuckReason !== 'CHURN_RISK') {
    return 'STUCK';
  }

  if (isBusinessActivated(snapshot) && snapshot.saleCount >= MIN_SALES_FOR_HEALTHY_WEEK) {
    return 'ACTIVE_BUSINESS';
  }

  if (isBusinessActivated(snapshot)) {
    return 'ACTIVE_BUSINESS';
  }

  if (stuckReason === 'CHURN_RISK' || snapshot.openSupportIssueCount > 0) {
    return 'NEEDS_HELP';
  }

  if (hasOpeningStock(snapshot) && hasProducts(snapshot) && !hasFirstSale(snapshot)) {
    return 'READY_TO_SELL';
  }

  if (setupProgressPercent > 0 && setupProgressPercent < 100) {
    return 'SETUP_IN_PROGRESS';
  }

  return 'GETTING_STARTED';
}

function stuckReasonCopy(reason: ActivationStuckReason): { next: string; control: string; owner: string } {
  switch (reason) {
    case 'STUCK_NO_PRODUCTS':
      return {
        next: 'Help add or import products',
        control: 'No products 24h after signup — call owner about import.',
        owner: 'Add your products to start selling. You can import a spreadsheet from Settings.',
      };
    case 'STUCK_NO_STOCK':
      return {
        next: 'Help record opening stock',
        control: 'Products added but no opening stock after 24h.',
        owner: 'Record opening stock so TillFlow knows what is on your shelf.',
      };
    case 'STUCK_NO_SALE':
      return {
        next: 'Help complete first sale',
        control: 'Stock recorded but no sale after 48h.',
        owner: 'Make your first sale on the till to see stock and money update.',
      };
    case 'STUCK_NO_REPORT':
      return {
        next: 'Show owner the dashboard',
        control: 'Sales started but owner has not viewed dashboard in 3+ days.',
        owner: 'Open your dashboard to see today’s sales and stock alerts.',
      };
    case 'STUCK_TRIAL_LOW_USAGE':
      return {
        next: 'Trial ending — low usage follow-up',
        control: 'Trial ending within 3 days with fewer than 5 sales.',
        owner: 'Your trial is ending soon. Make a few more sales or call us for setup help.',
      };
    case 'PAYMENT_OVERDUE':
      return {
        next: 'Confirm payment or extend grace',
        control: 'Billing restricted or overdue — payment follow-up required.',
        owner: 'Your account needs payment to keep selling. Open Billing in Settings.',
      };
    case 'SUPPORT_ISSUE_UNRESOLVED':
      return {
        next: 'Resolve open support issue',
        control: 'Open support issue — prioritise resolution.',
        owner: 'We are helping with your support request. Reply on WhatsApp if you need us.',
      };
    case 'CHURN_RISK':
      return {
        next: 'Proactive retention check-in',
        control: 'Churn risk flags raised — schedule owner call.',
        owner: 'We noticed low activity. Open TillFlow or WhatsApp us if you need help.',
      };
    default:
      return {
        next: 'Continue setup',
        control: 'Onboarding in progress.',
        owner: 'Continue your setup checklist to get ready to sell.',
      };
  }
}

export function computeActivationReadiness(
  snapshot: ActivationBusinessSnapshot
): ActivationReadinessResult {
  const now = snapshot.now ?? new Date();
  const billing = computeBillingAccessState(snapshot.subscription, now);
  const steps = buildActivationSteps(snapshot);
  const setupProgressPercent = getSetupProgressPercent(steps);
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

  const copy = stuckReason
    ? stuckReasonCopy(stuckReason)
    : nextStep
      ? {
          next: nextStep.title,
          control: `Next setup step: ${nextStep.title}`,
          owner: nextStep.explanation,
        }
      : stuckReasonCopy(null);

  const onboardingStage = resolveOnboardingStageFixed(snapshot, steps, billing.accessState);
  const churnRisk = computeChurnRisk(snapshot, billing.accessState, now);

  return {
    activationStatus,
    setupProgressPercent,
    completedSteps,
    missingSteps,
    steps,
    stuckReason,
    nextAction: copy.next,
    controlMessage: copy.control,
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
  steps: ActivationStepResult[],
  billingAccessState: BillingAccessState
): string {
  if (billingAccessState === 'PAID_ACTIVE') return 'paid_active';
  const billing = computeBillingAccessState(snapshot.subscription, snapshot.now ?? new Date());
  if (billing.firstPaymentAt) return 'paid_active';

  if (!hasProfileComplete(snapshot)) return 'signed_up';
  if (!hasBusinessType(snapshot)) return 'profile_completed';
  if (!hasProducts(snapshot)) return 'profile_completed';
  if (!hasOpeningStock(snapshot)) return 'products_added';
  if (!hasFirstSale(snapshot)) return 'stock_added';
  if (!hasFirstReport(snapshot)) return 'first_sale_completed';
  if (!hasTrialPaymentAck(snapshot)) return 'first_report_viewed';
  return 'ready_to_pay';
}

// Remove broken resolveOnboardingStage and fix computeChurnRisk isDemo
