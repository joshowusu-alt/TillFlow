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
  storefrontMode: StorefrontPricingMode;
  displayLabel: string;
  totalMonthlyBillingAmount: number;
};

export function getAnnualPlanPrice(monthlyPrice: number) {
  return monthlyPrice * 10;
}

export function getAnnualPlanSavings(monthlyPrice: number) {
  return monthlyPrice * 2;
}

export function resolveAddonForPlan(plan: BusinessPlan, requested: boolean): boolean {
  return plan === 'GROWTH' && requested;
}

export function computeSubscriptionPricing(input: SubscriptionPricingInput): SubscriptionPricingResult {
  const plan = input.plan;
  const billingInterval: BillingIntervalLabel =
    String(input.billingInterval ?? 'MONTHLY').toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
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

  let displayLabel = `${plan.charAt(0)}${plan.slice(1).toLowerCase()} · GHS ${totalMonthlyGhs}/mo`;
  if (storefrontMode === 'addon') {
    displayLabel = `Growth · GHS ${totalMonthlyGhs}/mo · Storefront add-on`;
  } else if (storefrontMode === 'included') {
    displayLabel = `Pro · GHS ${totalMonthlyGhs}/mo · Storefront included`;
  }

  return {
    basePlanMonthlyGhs,
    addOnMonthlyGhs,
    totalMonthlyGhs,
    totalAnnualGhs,
    storefrontMode,
    displayLabel,
    totalMonthlyBillingAmount: totalMonthlyGhs * 100,
  };
}

/** ControlSubscription.monthlyValuePence stores whole GHS amounts, not pesewas. */
export function controlMonthlyValueGhs(pricing: SubscriptionPricingResult): number {
  return pricing.totalMonthlyGhs;
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
    billingInterval: input.billingCadence,
  });
  const computed = controlMonthlyValueGhs(pricing);
  const stored = input.storedMonthlyGhs;
  if (stored == null || stored <= 0) return computed;
  if (input.addonOnlineStorefront && input.plan === 'GROWTH' && stored === PLAN_MONTHLY_PRICES.GROWTH) {
    return computed;
  }
  return stored;
}

export function storefrontPricingSummary(pricing: SubscriptionPricingResult, storefrontPublished: boolean) {
  const published = storefrontPublished ? 'Yes' : 'No';
  if (pricing.storefrontMode === 'included') {
    return {
      storefrontLine: 'Storefront: Included',
      monthlyLine: `Monthly charge: GHS ${pricing.totalMonthlyGhs}`,
      annualLine: `Annual equivalent: GHS ${pricing.totalAnnualGhs}`,
      publishedLine: `Storefront published: ${published}`,
    };
  }
  if (pricing.storefrontMode === 'addon') {
    return {
      storefrontLine: 'Storefront: Add-on selected (+GHS 200/month)',
      monthlyLine: `Monthly charge: GHS ${pricing.totalMonthlyGhs}`,
      annualLine: `Annual equivalent: GHS ${pricing.totalAnnualGhs}`,
      publishedLine: `Storefront published: ${published}`,
    };
  }
  return {
    storefrontLine: 'Storefront: Not selected',
    monthlyLine: `Monthly charge: GHS ${pricing.totalMonthlyGhs}`,
    annualLine: `Annual equivalent: GHS ${pricing.totalAnnualGhs}`,
    publishedLine: `Storefront published: ${published}`,
  };
}
