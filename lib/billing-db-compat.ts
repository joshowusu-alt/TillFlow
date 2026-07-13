import { prisma } from '@/lib/prisma';

const AUTH_LEGACY_SELECT = {
  id: true,
  name: true,
  currency: true,
  vatEnabled: true,
  vatNumber: true,
  mode: true,
  storeMode: true,
  receiptTemplate: true,
  printMode: true,
  printerName: true,
  labelPrintMode: true,
  labelPrinterName: true,
  labelSize: true,
  logoUrl: true,
  receiptLogoUrl: true,
  receiptHeader: true,
  receiptFooter: true,
  receiptShowVatNumber: true,
  receiptShowAddress: true,
  socialMediaHandle: true,
  address: true,
  phone: true,
  tinNumber: true,
  momoEnabled: true,
  momoProvider: true,
  momoNumber: true,
  openingCapitalPence: true,
  requireOpenTillForSales: true,
  varianceReasonRequired: true,
  discountApprovalThresholdBps: true,
  inventoryAdjustmentRiskThresholdBase: true,
  cashVarianceRiskThresholdPence: true,
  customerScope: true,
  whatsappEnabled: true,
  whatsappPhone: true,
  whatsappScheduleTime: true,
  whatsappBranchScope: true,
  minimumMarginThresholdBps: true,
  isDemo: true,
  onboardingCompletedAt: true,
  businessCategory: true,
  hasDemoData: true,
  guidedSetup: true,
  createdAt: true,
} as const;

export const AUTH_BILLING_SELECT = {
  ...AUTH_LEGACY_SELECT,
  plan: true,
  planStatus: true,
  selectedPlan: true,
  trialStartedAt: true,
  trialEndsAt: true,
  subscriptionStatus: true,
  firstPaymentAt: true,
  currentPeriodStartedAt: true,
  currentPeriodEndsAt: true,
  nextBillingDate: true,
  planSetAt: true,
  planChangedByUserId: true,
  lastPaymentAt: true,
  nextPaymentDueAt: true,
  paymentGraceEndsAt: true,
  suspendedAt: true,
  cancelledAt: true,
  billingAmount: true,
  billingCurrency: true,
  billingInterval: true,
  paymentProvider: true,
  paymentProviderStatus: true,
  billingNotes: true,
  // Entitlement flag merchant pages read to gate Online Storefront access.
  // Growth businesses can buy it as an add-on; Pro includes it by default.
  addonOnlineStorefront: true,
  brandCompactLogoUrl: true,
  logoWidth: true,
  logoHeight: true,
  brandCompactLogoWidth: true,
  brandCompactLogoHeight: true,
  brandSquareLogoUrl: true,
  brandSquareLogoWidth: true,
  brandSquareLogoHeight: true,
  brandInitials: true,
  brandPrimaryColor: true,
  brandCompactMode: true,
  brandLogoBackground: true,
} as const;

const COMMERCIAL_LEGACY_SELECT = {
  mode: true,
  storeMode: true,
} as const;

const COMMERCIAL_BILLING_SELECT = {
  ...COMMERCIAL_LEGACY_SELECT,
  plan: true,
  planStatus: true,
  selectedPlan: true,
  trialStartedAt: true,
  trialEndsAt: true,
  subscriptionStatus: true,
  firstPaymentAt: true,
  currentPeriodStartedAt: true,
  currentPeriodEndsAt: true,
  nextBillingDate: true,
  planSetAt: true,
  planChangedByUserId: true,
  lastPaymentAt: true,
  nextPaymentDueAt: true,
  paymentGraceEndsAt: true,
  suspendedAt: true,
  cancelledAt: true,
  billingAmount: true,
  billingCurrency: true,
  billingInterval: true,
  paymentProvider: true,
  paymentProviderStatus: true,
  billingNotes: true,
} as const;

export function isBillingSchemaError(error: unknown) {
  if (!(error instanceof Error)) return false;

  const message = error.message;
  return (
    (message.includes('Unknown field') || message.includes('does not exist in the current database')) &&
    [
      'plan',
      'planStatus',
      'selectedPlan',
      'trialStartedAt',
      'trialEndsAt',
      'subscriptionStatus',
      'firstPaymentAt',
      'currentPeriodStartedAt',
      'currentPeriodEndsAt',
      'nextBillingDate',
      'planSetAt',
      'planChangedByUserId',
      'lastPaymentAt',
      'nextPaymentDueAt',
      'paymentGraceEndsAt',
      'suspendedAt',
      'cancelledAt',
      'billingAmount',
      'billingCurrency',
      'billingInterval',
      'paymentProvider',
      'paymentProviderStatus',
      'billingNotes',
      'addonOnlineStorefront',
      'brandCompactLogoUrl',
      'logoWidth',
      'logoHeight',
      'brandCompactLogoWidth',
      'brandCompactLogoHeight',
      'brandSquareLogoUrl',
      'brandSquareLogoWidth',
      'brandSquareLogoHeight',
      'brandInitials',
      'brandPrimaryColor',
      'brandCompactMode',
      'brandLogoBackground',
    ].some(
      (field) => message.includes(field)
    )
  );
}

export async function findBusinessForAuth(businessId: string) {
  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: AUTH_BILLING_SELECT,
    });

    return { business, billingSchemaReady: true };
  } catch (error) {
    if (!isBillingSchemaError(error)) throw error;

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: AUTH_LEGACY_SELECT,
    });

    return { business, billingSchemaReady: false };
  }
}

export async function findBusinessCommercialSnapshot(businessId: string) {
  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: COMMERCIAL_BILLING_SELECT,
    });

    return { business, billingSchemaReady: true };
  } catch (error) {
    if (!isBillingSchemaError(error)) throw error;

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: COMMERCIAL_LEGACY_SELECT,
    });

    return { business, billingSchemaReady: false };
  }
}
