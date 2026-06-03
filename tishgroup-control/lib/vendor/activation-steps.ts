/**
 * Phase 6: canonical activation steps for "Start properly" onboarding.
 * Completion rules are evaluated in activation-readiness.ts.
 */

export const ACTIVATION_STEP_KEYS = [
  'profile',
  'business-type',
  'plan',
  'staff',
  'products',
  'opening-stock',
  'payments',
  'first-purchase',
  'first-sale',
  'first-report',
  'trial-payment',
  'complete',
] as const;

export type ActivationStepKey = (typeof ACTIVATION_STEP_KEYS)[number];

export type ActivationStepStatus = 'not_started' | 'in_progress' | 'done';

export type ActivationStepDefinition = {
  key: ActivationStepKey;
  title: string;
  explanation: string;
  href: string;
  /** Steps counted toward setup progress % (all except optional complete marker). */
  countsTowardProgress: boolean;
};

export const ACTIVATION_STEP_DEFINITIONS: ActivationStepDefinition[] = [
  {
    key: 'profile',
    title: 'Confirm business profile',
    explanation: 'Add your shop name, phone, and address so receipts and reports look right.',
    href: '/settings',
    countsTowardProgress: true,
  },
  {
    key: 'business-type',
    title: 'Choose business type',
    explanation: 'Tell us what kind of shop you run so TillFlow fits your daily work.',
    href: '/settings',
    countsTowardProgress: true,
  },
  {
    key: 'plan',
    title: 'Select your plan',
    explanation: 'Your trial plan is already chosen — review billing when you are ready.',
    href: '/settings/billing',
    countsTowardProgress: true,
  },
  {
    key: 'staff',
    title: 'Add staff',
    explanation: 'Invite cashiers or managers who will use the till.',
    href: '/users',
    countsTowardProgress: true,
  },
  {
    key: 'products',
    title: 'Add your products',
    explanation: 'Start with the items you sell — add one by one or upload a spreadsheet.',
    href: '/products?from=setup',
    countsTowardProgress: true,
  },
  {
    key: 'opening-stock',
    title: 'Add opening stock',
    explanation: 'Record what is already on the shelf and in the drawer before you start selling.',
    href: '/setup/opening-stock',
    countsTowardProgress: true,
  },
  {
    key: 'payments',
    title: 'Configure payment methods',
    explanation: 'Set up MoMo and how you take cash, card, or credit at the till.',
    href: '/settings',
    countsTowardProgress: true,
  },
  {
    key: 'first-purchase',
    title: 'Record first purchase',
    explanation: 'Enter stock you bought from a supplier so costs and stock stay accurate.',
    href: '/purchases',
    countsTowardProgress: true,
  },
  {
    key: 'first-sale',
    title: 'Make your first sale',
    explanation: 'Open the till, sell something real, and see stock and money update.',
    href: '/pos',
    countsTowardProgress: true,
  },
  {
    key: 'first-report',
    title: 'View your first report',
    explanation: 'Open your dashboard to see today’s sales and what needs attention.',
    href: '/',
    countsTowardProgress: true,
  },
  {
    key: 'trial-payment',
    title: 'Confirm trial and payment date',
    explanation: 'See when your free trial ends and how to pay to stay active.',
    href: '/settings/billing',
    countsTowardProgress: true,
  },
  {
    key: 'complete',
    title: 'Complete setup',
    explanation: 'Finish setup when the main steps are done — you can always come back here.',
    href: '/onboarding',
    countsTowardProgress: false,
  },
];

export const MIN_PRODUCTS_FOR_ACTIVATION = 10;
export const MIN_PRODUCTS_FOR_PROGRESS = 3;
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
