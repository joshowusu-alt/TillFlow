/**
 * Phase 1 activation steps — four stages to the first successful sale.
 * Optional business features stay available later under "Improve your records".
 */

export const ACTIVATION_STEP_KEYS = [
  'business',
  'products',
  'stock',
  'selling',
  'complete',
] as const;

export type ActivationStepKey = (typeof ACTIVATION_STEP_KEYS)[number];

export type ActivationStepStatus = 'not_started' | 'in_progress' | 'done';

export type ActivationStepDefinition = {
  key: ActivationStepKey;
  title: string;
  explanation: string;
  href: string;
  /** Steps counted toward internal setup progress (not shown as owner %). */
  countsTowardProgress: boolean;
};

export const ACTIVATION_STEP_DEFINITIONS: ActivationStepDefinition[] = [
  {
    key: 'business',
    title: 'Tell us about your business',
    explanation: 'Add your business name and type so receipts and setup look right. Phone and address can wait.',
    href: '/onboarding#business',
    countsTowardProgress: true,
  },
  {
    key: 'products',
    title: 'Add or import what you sell',
    explanation: 'Add a product manually or import a catalogue. Purchases mode is not part of onboarding.',
    href: '/onboarding#products',
    countsTowardProgress: true,
  },
  {
    key: 'stock',
    title: 'Add stock now or later',
    explanation:
      'A full stock count is not required. At least one sellable product is needed before Ready to sell.',
    href: '/onboarding#stock',
    countsTowardProgress: true,
  },
  {
    key: 'selling',
    title: 'Start selling',
    explanation: 'Open POS and make your first successful sale. Opening the till does not finish setup.',
    href: '/pos',
    countsTowardProgress: true,
  },
  {
    key: 'complete',
    title: 'First sale complete',
    explanation: 'Onboarding completes after your first genuine successful sale.',
    href: '/onboarding',
    countsTowardProgress: false,
  },
];

/** @deprecated Phase 1 no longer uses a 10-product activation gate for owner readiness. */
export const MIN_PRODUCTS_FOR_ACTIVATION = 1;
/** @deprecated Phase 1 needs one valid product, not three. */
export const MIN_PRODUCTS_FOR_PROGRESS = 1;
export const MIN_SALES_FOR_HEALTHY_WEEK = 5;

export const BUSINESS_CATEGORIES = [
  'SUPERMARKET',
  'PROVISION',
  'MINI_MART',
  'PHARMACY',
  'COSMETICS',
  'HARDWARE',
  'WHOLESALE',
  'RESTAURANT_STOCK',
  'OTHER',
] as const;

export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];
