import type { ReadinessData } from '@/app/actions/onboarding';
import type { BusinessPlan } from '@/lib/features';

const completedJourney = {
  status: 'IMPROVING_RECORDS' as const,
  statusLabel: 'Improving your records',
  stages: [
    { key: 'business' as const, title: 'Tell us about your business', explanation: '', done: true, href: '/onboarding#business' },
    { key: 'products' as const, title: 'Add or import what you sell', explanation: '', done: true, href: '/onboarding#products' },
    { key: 'stock' as const, title: 'Add stock now or later', explanation: '', done: true, href: '/onboarding#stock' },
    { key: 'selling' as const, title: 'Start selling', explanation: '', done: true, href: '/pos' },
  ],
  upNext: null,
  stockDeferredMessage: null,
  zeroStockBlockMessage: null,
  optionalImprovements: [],
  hasBusinessName: true,
  hasBusinessType: true,
  hasValidProduct: true,
  hasSellableProduct: true,
  hasFirstSale: true,
  onboardingComplete: true,
};

function base(plan: BusinessPlan = 'GROWTH'): ReadinessData {
  return {
    businessName: 'Demo Supermarket',
    userName: 'Ama Owner',
    currency: 'GHS',
    pct: 100,
    activationStatus: 'ACTIVE_BUSINESS',
    activationStatusLabel: 'Improving your records',
    stuckReason: null,
    stuckMessage: null,
    ownerMessage: 'Your business is active.',
    nextAction: 'Open POS',
    businessCategory: 'SUPERMARKET',
    businessCategoryLabel: 'Supermarket',
    journey: completedJourney,
    stages: completedJourney.stages,
    upNext: null,
    optionalImprovements: [],
    improveRecords: {
      primary: null,
      secondary: [],
      allClear: true,
      allClearMessage:
        'Your key records are in good shape. TillFlow will surface the next useful improvement when needed.',
    },
    steps: [],
    nextStep: null,
    hasDemoData: false,
    hasSeedData: false,
    productCount: 120,
    validProductCount: 120,
    sellableProductCount: 100,
    staffCount: 4,
    saleCount: 50,
    onboardingComplete: true,
    onboardingCompletedAt: new Date('2026-01-01'),
    guidedSetup: false,
    todayRevenuePence: 467_500,
    yesterdayRevenuePence: 700_000,
    todayTransactionCount: 12,
    yesterdayTransactionCount: 100,
    openIssueCount: 0,
    openShiftCount: 0,
    openShiftSalesCount: 0,
    openShiftOpenedAt: null,
    reorderNeededCount: 0,
    overdueSupplierInvoiceCount: 0,
    expectedCashPence: 0,
    lastShiftClosedAt: new Date('2026-06-13T21:54:00').toISOString(),
    lastReceiptId: 'receipt-preview-1',
    plan,
  };
}

const missingCostPrimary = {
  key: 'missing-costs' as const,
  title: 'Complete your product costs',
  explanation: 'Your sales are recorded, but profit is incomplete for 12 products.',
  actionLabel: 'Review missing costs',
  href: '/products?missingCost=1',
  priority: 100,
};

export const HOME_PREVIEW_FIXTURES: Record<string, ReadinessData> = {
  'established-issues': {
    ...base(),
    openIssueCount: 5,
    openShiftCount: 1,
    openShiftSalesCount: 8,
    openShiftOpenedAt: new Date('2026-02-17T08:15:00').toISOString(),
    overdueSupplierInvoiceCount: 2,
    reorderNeededCount: 4,
    expectedCashPence: 125_000,
    improveRecords: {
      primary: missingCostPrimary,
      secondary: [
        {
          key: 'purchases',
          title: 'Record your purchases',
          explanation: 'Recording purchases keeps stock and costs accurate.',
          actionLabel: 'Add a purchase',
          href: '/purchases',
          priority: 70,
        },
      ],
      allClear: false,
      allClearMessage: '',
    },
  },
  'records-only': {
    ...base(),
    improveRecords: {
      primary: missingCostPrimary,
      secondary: [
        {
          key: 'stock-completeness',
          title: 'Fill stock gaps',
          explanation: 'Some products still need opening stock levels.',
          actionLabel: 'Review stock gaps',
          href: '/products?issue=STOCK_SETUP_GAP',
          priority: 90,
        },
        {
          key: 'opening-balances',
          title: 'Complete your starting balances',
          explanation: 'Add what the business owned and owed when TillFlow started.',
          actionLabel: 'Review opening balances',
          href: '/settings#opening-capital',
          priority: 80,
        },
        {
          key: 'purchases',
          title: 'Record your purchases',
          explanation: 'Recording purchases keeps stock and costs accurate.',
          actionLabel: 'Review purchases',
          href: '/purchases',
          priority: 70,
        },
      ],
      allClear: false,
      allClearMessage: '',
    },
  },
  'all-clear': {
    ...base(),
    lastReceiptId: null,
  },
  'new-business': {
    ...base(),
    saleCount: 3,
    productCount: 18,
    todayRevenuePence: 12_000,
    todayTransactionCount: 2,
    yesterdayRevenuePence: 0,
    hasDemoData: true,
    lastReceiptId: null,
    improveRecords: {
      primary: {
        key: 'opening-balances',
        title: 'Complete your starting balances',
        explanation: 'Add what the business owned and owed when TillFlow started.',
        actionLabel: 'Review opening balances',
        href: '/settings#opening-capital',
        priority: 80,
      },
      secondary: [],
      allClear: false,
      allClearMessage: '',
    },
  },
  'open-shift': {
    ...base(),
    openShiftCount: 1,
    openShiftSalesCount: 5,
    openShiftOpenedAt: new Date('2026-07-20T07:30:00').toISOString(),
    expectedCashPence: 89_000,
  },
  'no-open-shift': {
    ...base(),
    openShiftCount: 0,
    expectedCashPence: 0,
  },
  'supplier-overdue': {
    ...base(),
    openIssueCount: 1,
    overdueSupplierInvoiceCount: 3,
  },
  'starter-reorder': {
    ...base('STARTER'),
    openIssueCount: 1,
    reorderNeededCount: 6,
  },
  'growth-reorder': {
    ...base('GROWTH'),
    openIssueCount: 1,
    reorderNeededCount: 6,
  },
  'with-receipt': {
    ...base(),
    lastReceiptId: 'receipt-preview-99',
    // Established leftover sample + receipt — exercises quiet notice + Last receipt together.
    hasSeedData: true,
  },
  'without-receipt': {
    ...base(),
    lastReceiptId: null,
  },
};

export type HomePreviewFixtureKey = keyof typeof HOME_PREVIEW_FIXTURES;
