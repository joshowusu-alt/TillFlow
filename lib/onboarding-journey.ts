/**
 * Phase 1 onboarding journey — four stages to the first successful sale.
 * Optional improvements never affect readiness.
 */

import { BUSINESS_CATEGORIES, type BusinessCategory } from './activation-steps';

export const ONBOARDING_STAGE_KEYS = ['business', 'products', 'stock', 'selling'] as const;
export type OnboardingStageKey = (typeof ONBOARDING_STAGE_KEYS)[number];

export type OnboardingJourneyStatus =
  | 'GETTING_READY'
  | 'READY_TO_SELL'
  | 'FIRST_SALE_COMPLETE'
  | 'IMPROVING_RECORDS';

export type OnboardingUpNextKey =
  | 'business-name'
  | 'business-type'
  | 'add-product'
  | 'add-stock'
  | 'start-selling'
  | 'first-sale-complete';

export type OnboardingJourneySnapshot = {
  name: string;
  businessCategory: string | null;
  /** Active products with sellingPriceBasePence > 0 */
  validProductCount: number;
  /** Valid products with on-hand qty > 0 */
  sellableProductCount: number;
  /** Any product rows (including inactive / zero price) — for messaging only */
  productCount: number;
  saleCount: number;
  onboardingCompletedAt: Date | null;
};

export type OnboardingStageResult = {
  key: OnboardingStageKey;
  title: string;
  explanation: string;
  done: boolean;
  href: string;
};

export type OnboardingUpNext = {
  key: OnboardingUpNextKey;
  title: string;
  explanation: string;
  href: string;
  /** When true, primary CTA is Start selling (navigate only). */
  isStartSelling: boolean;
};

export type OptionalImprovement = {
  key: string;
  title: string;
  explanation: string;
  href: string;
};

export type OnboardingJourneyResult = {
  status: OnboardingJourneyStatus;
  statusLabel: string;
  stages: OnboardingStageResult[];
  upNext: OnboardingUpNext | null;
  stockDeferredMessage: string | null;
  zeroStockBlockMessage: string | null;
  optionalImprovements: OptionalImprovement[];
  hasBusinessName: boolean;
  hasBusinessType: boolean;
  hasValidProduct: boolean;
  hasSellableProduct: boolean;
  hasFirstSale: boolean;
  /** True when first sale exists OR historical onboardingCompletedAt is set. */
  onboardingComplete: boolean;
};

export function hasBusinessName(snapshot: Pick<OnboardingJourneySnapshot, 'name'>): boolean {
  return Boolean(snapshot.name?.trim());
}

export function hasBusinessType(
  snapshot: Pick<OnboardingJourneySnapshot, 'businessCategory'>
): boolean {
  return Boolean(snapshot.businessCategory?.trim());
}

export function hasValidProduct(
  snapshot: Pick<OnboardingJourneySnapshot, 'validProductCount'>
): boolean {
  return snapshot.validProductCount > 0;
}

export function hasSellableProduct(
  snapshot: Pick<OnboardingJourneySnapshot, 'sellableProductCount'>
): boolean {
  return snapshot.sellableProductCount > 0;
}

export function hasFirstSale(snapshot: Pick<OnboardingJourneySnapshot, 'saleCount'>): boolean {
  return snapshot.saleCount > 0;
}

export function isReadyToSell(snapshot: OnboardingJourneySnapshot): boolean {
  return (
    hasBusinessName(snapshot) &&
    hasBusinessType(snapshot) &&
    hasValidProduct(snapshot) &&
    hasSellableProduct(snapshot)
  );
}

export function resolveOnboardingJourneyStatus(
  snapshot: OnboardingJourneySnapshot
): OnboardingJourneyStatus {
  if (hasFirstSale(snapshot)) {
    // After the first genuine sale, onboarding is complete — ongoing work is improvements.
    return snapshot.onboardingCompletedAt ? 'IMPROVING_RECORDS' : 'FIRST_SALE_COMPLETE';
  }
  if (snapshot.onboardingCompletedAt) {
    return 'IMPROVING_RECORDS';
  }
  if (isReadyToSell(snapshot)) return 'READY_TO_SELL';
  return 'GETTING_READY';
}

export function getOnboardingJourneyStatusLabel(status: OnboardingJourneyStatus): string {
  switch (status) {
    case 'GETTING_READY':
      return 'Getting ready';
    case 'READY_TO_SELL':
      return 'Ready to sell';
    case 'FIRST_SALE_COMPLETE':
      return 'First sale complete';
    case 'IMPROVING_RECORDS':
      return 'Improving your records';
  }
}

export function buildOnboardingStages(snapshot: OnboardingJourneySnapshot): OnboardingStageResult[] {
  const businessDone = hasBusinessName(snapshot) && hasBusinessType(snapshot);
  const productsDone = hasValidProduct(snapshot);
  const stockDone = hasSellableProduct(snapshot);
  const sellingDone = hasFirstSale(snapshot) || Boolean(snapshot.onboardingCompletedAt);

  return [
    {
      key: 'business',
      title: 'Tell us about your business',
      explanation: 'Business name and type — kept here, not in Settings.',
      done: businessDone,
      href: '/onboarding#business',
    },
    {
      key: 'products',
      title: 'Add or import what you sell',
      explanation: 'Add a product manually or import a catalogue / opening stock file.',
      done: productsDone,
      href: '/onboarding#products',
    },
    {
      key: 'stock',
      title: 'Add stock now or later',
      explanation:
        'A full stock count is not required. At least one sellable product is needed before Ready to sell.',
      done: stockDone,
      href: '/onboarding#stock',
    },
    {
      key: 'selling',
      title: 'Start selling',
      explanation: 'Open the till and make your first successful sale to finish onboarding.',
      done: sellingDone,
      href: '/pos',
    },
  ];
}

export function resolveOnboardingUpNext(snapshot: OnboardingJourneySnapshot): OnboardingUpNext | null {
  if (hasFirstSale(snapshot)) {
    return {
      key: 'first-sale-complete',
      title: 'First sale complete',
      explanation: 'Keep improving your records when you have time.',
      href: '/reports/dashboard',
      isStartSelling: false,
    };
  }
  if (!hasBusinessName(snapshot)) {
    return {
      key: 'business-name',
      title: 'Complete business name',
      explanation: 'Enter the name customers see on receipts.',
      href: '/onboarding#business',
      isStartSelling: false,
    };
  }
  if (!hasBusinessType(snapshot)) {
    return {
      key: 'business-type',
      title: 'Choose business type',
      explanation: 'Tell us what kind of business you run.',
      href: '/onboarding#business',
      isStartSelling: false,
    };
  }
  if (!hasValidProduct(snapshot)) {
    return {
      key: 'add-product',
      title: 'Add or import a product',
      explanation: 'Add one product manually or import a product catalogue.',
      href: '/onboarding#products',
      isStartSelling: false,
    };
  }
  if (!hasSellableProduct(snapshot)) {
    return {
      key: 'add-stock',
      title: 'Add stock to at least one product',
      explanation:
        'Add stock to at least one product to make your first sale. You can complete the rest later.',
      href: '/onboarding#stock',
      isStartSelling: false,
    };
  }
  return {
    key: 'start-selling',
    title: 'Start selling',
    explanation: 'Open POS and make your first successful sale. Opening the till does not finish setup.',
    href: '/pos',
    isStartSelling: true,
  };
}

/**
 * Phase 2: static optional checklist removed.
 * Improve Your Records recommendations come from lib/improve-records.ts
 * via getReadiness — outcome-based, not a permanent seven-item list.
 */
export function buildOptionalImprovements(
  _snapshot: OnboardingJourneySnapshot
): OptionalImprovement[] {
  return [];
}

export function computeOnboardingJourney(
  snapshot: OnboardingJourneySnapshot
): OnboardingJourneyResult {
  const status = resolveOnboardingJourneyStatus(snapshot);
  const hasName = hasBusinessName(snapshot);
  const hasType = hasBusinessType(snapshot);
  const valid = hasValidProduct(snapshot);
  const sellable = hasSellableProduct(snapshot);
  const firstSale = hasFirstSale(snapshot);

  let stockDeferredMessage: string | null = null;
  let zeroStockBlockMessage: string | null = null;
  if (valid && !sellable && !firstSale && !snapshot.onboardingCompletedAt) {
    zeroStockBlockMessage =
      'Add stock to at least one product to make your first sale. You can complete the rest later.';
  }
  if (sellable && !firstSale && !snapshot.onboardingCompletedAt) {
    stockDeferredMessage =
      'You can start with the products ready today and complete the rest of your stock records over time.';
  }

  const onboardingComplete = firstSale || Boolean(snapshot.onboardingCompletedAt);

  return {
    status,
    statusLabel: getOnboardingJourneyStatusLabel(status),
    stages: buildOnboardingStages(snapshot),
    upNext: resolveOnboardingUpNext(snapshot),
    stockDeferredMessage,
    zeroStockBlockMessage,
    optionalImprovements: buildOptionalImprovements(snapshot),
    hasBusinessName: hasName,
    hasBusinessType: hasType,
    hasValidProduct: valid,
    hasSellableProduct: sellable,
    hasFirstSale: firstSale,
    onboardingComplete,
  };
}

/** Progress for internal/control sync only — never shown as owner %. */
export function getJourneyProgressPercent(snapshot: OnboardingJourneySnapshot): number {
  let done = 0;
  if (hasBusinessName(snapshot) && hasBusinessType(snapshot)) done += 1;
  if (hasValidProduct(snapshot)) done += 1;
  if (hasSellableProduct(snapshot)) done += 1;
  if (hasFirstSale(snapshot) || snapshot.onboardingCompletedAt) done += 1;
  return Math.round((done / 4) * 100);
}

export function isKnownBusinessCategory(value: string): value is BusinessCategory {
  return (BUSINESS_CATEGORIES as readonly string[]).includes(value);
}

export const BUSINESS_CATEGORY_LABELS: Record<string, string> = {
  SUPERMARKET: 'Supermarket',
  PROVISION: 'Provisions business',
  MINI_MART: 'Mini mart',
  PHARMACY: 'Pharmacy',
  COSMETICS: 'Cosmetics / beauty',
  HARDWARE: 'Hardware',
  WHOLESALE: 'Wholesaler',
  RESTAURANT_STOCK: 'Food business with stock',
  OTHER: 'Other product business',
};
