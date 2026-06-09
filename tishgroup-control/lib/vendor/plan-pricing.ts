import type { BusinessPlan } from './features';

export const PLAN_MONTHLY_PRICES: Record<BusinessPlan, number> = {
  STARTER: 199,
  GROWTH: 349,
  PRO: 699,
};

export const ADDON_ONLINE_STOREFRONT_MONTHLY = 200;

export type StorefrontPricingMode = 'none' | 'addon' | 'included';

export type BillingIntervalLabel = 'MONTHLY' | 'ANNUAL';

export type SubscriptionPricingInput = {
  plan: BusinessPlan;
  addonOnlineStorefront?: boolean | null;
  billingInterval?: BillingIntervalLabel | null;
};

export type SubscriptionPricingResult = {
  basePlanMonthlyGhs: number;
  addOnMonthlyGhs: number;
  totalMonthlyGhs: number;
  totalAnnualGhs: number;
  billingInterval: BillingIntervalLabel;
  totalDueGhs: number;
  annualSavingsGhs: number;
  annualComparisonGhs: number;
  storefrontMode: StorefrontPricingMode;
  displayLabel: string;
  /** Monthly amount in TillFlow pesewas convention. */
  totalMonthlyBillingAmount: number;
  /** Interval due amount in TillFlow pesewas convention (monthly or annual). */
  totalBillingAmount: number;
};

export function normalizeBillingInterval(value?: string | null): BillingIntervalLabel {
  return String(value ?? 'MONTHLY').toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
}

export function getAnnualPlanPrice(monthlyPrice: number) {
  return monthlyPrice * 10;
}

export function getAnnualPlanSavings(monthlyPrice: number) {
  return monthlyPrice * 2;
}

/** Only Growth may persist a paid online storefront add-on. */
export function resolveAddonForPlan(plan: BusinessPlan, requested: boolean): boolean {
  return plan === 'GROWTH' && requested;
}

function buildDisplayLabel(
  plan: BusinessPlan,
  billingInterval: BillingIntervalLabel,
  totalMonthlyGhs: number,
  totalDueGhs: number,
  storefrontMode: StorefrontPricingMode,
): string {
  const planName = plan.charAt(0) + plan.slice(1).toLowerCase();
  const intervalLabel = billingInterval === 'ANNUAL' ? 'Annual' : 'Monthly';

  if (storefrontMode === 'addon') {
    return billingInterval === 'ANNUAL'
      ? `Growth · ${intervalLabel} · GHS ${totalDueGhs.toLocaleString('en-GH')}/yr · Storefront add-on`
      : `Growth · GHS ${totalMonthlyGhs}/mo · Storefront add-on`;
  }
  if (storefrontMode === 'included') {
    return billingInterval === 'ANNUAL'
      ? `Pro · ${intervalLabel} · GHS ${totalDueGhs.toLocaleString('en-GH')}/yr · Storefront included`
      : `Pro · GHS ${totalMonthlyGhs}/mo · Storefront included`;
  }
  return billingInterval === 'ANNUAL'
    ? `${planName} · ${intervalLabel} · GHS ${totalDueGhs.toLocaleString('en-GH')}/yr`
    : `${planName} · ${intervalLabel} · GHS ${totalMonthlyGhs}/mo`;
}

export function computeSubscriptionPricing(input: SubscriptionPricingInput): SubscriptionPricingResult {
  const plan = input.plan;
  const billingInterval = normalizeBillingInterval(input.billingInterval);
  const addonSelected = resolveAddonForPlan(plan, Boolean(input.addonOnlineStorefront));

  const basePlanMonthlyGhs = PLAN_MONTHLY_PRICES[plan];
  let addOnMonthlyGhs = 0;
  let storefrontMode: StorefrontPricingMode = 'none';

  if (plan === 'PRO') {
    storefrontMode = 'included';
  } else if (plan === 'GROWTH' && addonSelected) {
    addOnMonthlyGhs = ADDON_ONLINE_STOREFRONT_MONTHLY;
    storefrontMode = 'addon';
  }

  const totalMonthlyGhs = basePlanMonthlyGhs + addOnMonthlyGhs;
  const totalAnnualGhs = getAnnualPlanPrice(totalMonthlyGhs);
  const annualSavingsGhs = getAnnualPlanSavings(totalMonthlyGhs);
  const annualComparisonGhs = totalMonthlyGhs * 12;
  const totalDueGhs = billingInterval === 'ANNUAL' ? totalAnnualGhs : totalMonthlyGhs;

  return {
    basePlanMonthlyGhs,
    addOnMonthlyGhs,
    totalMonthlyGhs,
    totalAnnualGhs,
    billingInterval,
    totalDueGhs,
    annualSavingsGhs,
    annualComparisonGhs,
    storefrontMode,
    displayLabel: buildDisplayLabel(plan, billingInterval, totalMonthlyGhs, totalDueGhs, storefrontMode),
    totalMonthlyBillingAmount: totalMonthlyGhs * 100,
    totalBillingAmount: totalDueGhs * 100,
  };
}

/** Server-side register plan + add-on + billing interval normalization. */
export function resolveRegisterPlanSelection(
  rawPlan: string,
  rawAddonSelected: boolean,
  rawBillingInterval?: string | null,
): {
  plan: BusinessPlan;
  addonOnlineStorefront: boolean;
  billingInterval: BillingIntervalLabel;
  pricing: SubscriptionPricingResult;
} {
  const plan = (['STARTER', 'GROWTH', 'PRO'] as const).includes(rawPlan as BusinessPlan)
    ? (rawPlan as BusinessPlan)
    : 'STARTER';
  const billingInterval = normalizeBillingInterval(rawBillingInterval);
  const addonOnlineStorefront = resolveAddonForPlan(plan, rawAddonSelected);
  const pricing = computeSubscriptionPricing({ plan, addonOnlineStorefront, billingInterval });
  return { plan, addonOnlineStorefront, billingInterval, pricing };
}

/**
 * ControlSubscription.monthlyValuePence stores whole GHS amounts (199, 349, 549),
 * not pesewas — despite the field name. TillFlow Business.billingAmount uses pesewas (×100).
 */
export function controlMonthlyValueGhs(pricing: SubscriptionPricingResult): number {
  return pricing.totalMonthlyGhs;
}

export function controlIntervalChargeGhs(pricing: SubscriptionPricingResult): number {
  return pricing.totalDueGhs;
}

export function resolveControlPaymentAmounts(
  pricing: SubscriptionPricingResult,
  enteredAmountGhs?: number | null,
) {
  const recommendedIntervalChargeGhs = controlIntervalChargeGhs(pricing);
  const recordedAmountGhs =
    enteredAmountGhs != null && enteredAmountGhs > 0
      ? enteredAmountGhs
      : recommendedIntervalChargeGhs;

  return {
    recordedAmountGhs,
    businessBillingAmountPence: pricing.totalBillingAmount,
  };
}

/** Resolve Control monthly charge from plan + add-on, self-healing stale Growth base-only values. */
export function resolveControlMonthlyValueGhs(input: {
  plan: BusinessPlan;
  addonOnlineStorefront?: boolean | null;
  billingCadence?: BillingIntervalLabel | null;
  storedMonthlyGhs?: number | null;
}): number {
  const pricing = computeSubscriptionPricing({
    plan: input.plan,
    addonOnlineStorefront: input.addonOnlineStorefront,
    billingInterval: 'MONTHLY',
  });
  const computed = controlMonthlyValueGhs(pricing);
  const stored = input.storedMonthlyGhs;
  if (stored == null || stored <= 0) return computed;
  if (input.addonOnlineStorefront && input.plan === 'GROWTH' && stored === PLAN_MONTHLY_PRICES.GROWTH) {
    return computed;
  }
  return stored;
}

/** Collection / payment follow-up amount for the active billing interval. */
export function resolveControlCollectionAmountGhs(input: {
  plan: BusinessPlan;
  addonOnlineStorefront?: boolean | null;
  billingCadence?: BillingIntervalLabel | null;
  storedMonthlyGhs?: number | null;
  storedOutstandingGhs?: number | null;
}): number {
  if (input.storedOutstandingGhs != null && input.storedOutstandingGhs > 0) {
    return input.storedOutstandingGhs;
  }
  const billingInterval = normalizeBillingInterval(input.billingCadence);
  const pricing = computeSubscriptionPricing({
    plan: input.plan,
    addonOnlineStorefront: input.addonOnlineStorefront,
    billingInterval,
  });
  return controlIntervalChargeGhs(pricing);
}

export function storefrontPricingSummary(
  pricing: SubscriptionPricingResult,
  storefrontPublished: boolean,
  plan?: BusinessPlan,
) {
  const published = storefrontPublished ? 'Yes' : 'No';
  const billingLine = pricing.billingInterval === 'ANNUAL' ? 'Billing: Annual' : 'Billing: Monthly';
  const monthlyValueLine = `Monthly value: GHS ${pricing.totalMonthlyGhs}`;
  const intervalChargeLine =
    pricing.billingInterval === 'ANNUAL'
      ? `Annual charge: GHS ${pricing.totalAnnualGhs.toLocaleString('en-GH')}/year`
      : `Current charge: GHS ${pricing.totalMonthlyGhs}/month`;
  const savingsLine =
    pricing.billingInterval === 'ANNUAL'
      ? `Saving: GHS ${pricing.annualSavingsGhs.toLocaleString('en-GH')}`
      : null;

  if (pricing.storefrontMode === 'included') {
    return {
      storefrontLine: 'Storefront: Included',
      billingLine,
      monthlyValueLine,
      intervalChargeLine,
      savingsLine,
      publishedLine: `Storefront published: ${published}`,
    };
  }
  if (pricing.storefrontMode === 'addon') {
    return {
      storefrontLine: 'Storefront: Add-on selected (+GHS 200/month)',
      billingLine,
      monthlyValueLine,
      intervalChargeLine,
      savingsLine,
      publishedLine: `Storefront published: ${published}`,
    };
  }
  // storefrontMode === 'none' covers both Starter (storefront not available at
  // all) and Growth without the add-on (available but not selected).
  return {
    storefrontLine: plan === 'STARTER' ? 'Storefront: Not available' : 'Storefront: Not selected',
    billingLine,
    monthlyValueLine,
    intervalChargeLine,
    savingsLine,
    publishedLine: `Storefront published: ${published}`,
  };
}
