/**
 * Canonical money conversion boundary for TishGroup / TillFlow billing.
 *
 * Control plane `*Pence` columns store whole GHS (199, 349, 549, 699)
 * despite the column name. TillFlow `Business.billingAmount` stores pesewas.
 */

export const CONTROL_MONEY_CURRENCY = 'GHS' as const;
export const CONTROL_AMOUNT_UNIT = 'GHS' as const;
export const TILLFLOW_BILLING_AMOUNT_UNIT = 'PESEWAS' as const;

export const PLAN_MONTHLY_GHS = {
  STARTER: 199,
  GROWTH: 349,
  PRO: 699,
} as const;

export const GROWTH_STOREFRONT_ADDON_GHS = 200;
export const ANNUAL_MONTHS_PREPAID = 10;

export class UnsupportedBillingCurrencyError extends Error {
  readonly code = 'UNSUPPORTED_BILLING_CURRENCY';

  constructor(currency: string) {
    super(`Unsupported billing currency ${JSON.stringify(currency)}. Only GHS is supported.`);
    this.name = 'UnsupportedBillingCurrencyError';
  }
}

export function assertSupportedCurrency(currency?: string | null): 'GHS' {
  const value = String(currency ?? 'GHS').trim().toUpperCase();
  if (value !== 'GHS') {
    throw new UnsupportedBillingCurrencyError(value || '(empty)');
  }
  return 'GHS';
}

export function ghsToPesewas(ghs: number): number {
  return Math.round(ghs * 100);
}

export function pesewasToGhs(pesewas: number): number {
  return pesewas / 100;
}

export function annualContractGhs(monthlyGhs: number): number {
  return monthlyGhs * ANNUAL_MONTHS_PREPAID;
}

export function paidArrGhs(args: { monthlyValueGhs: number; billingCadence: 'MONTHLY' | 'ANNUAL' }): number {
  return args.billingCadence === 'ANNUAL'
    ? annualContractGhs(args.monthlyValueGhs)
    : args.monthlyValueGhs * 12;
}

export function knownCatalogExamples() {
  return {
    starterMonthlyGhs: PLAN_MONTHLY_GHS.STARTER,
    growthMonthlyGhs: PLAN_MONTHLY_GHS.GROWTH,
    growthStorefrontMonthlyGhs: PLAN_MONTHLY_GHS.GROWTH + GROWTH_STOREFRONT_ADDON_GHS,
    proMonthlyGhs: PLAN_MONTHLY_GHS.PRO,
    starterAnnualGhs: annualContractGhs(PLAN_MONTHLY_GHS.STARTER),
    growthAnnualGhs: annualContractGhs(PLAN_MONTHLY_GHS.GROWTH),
    growthStorefrontAnnualGhs: annualContractGhs(PLAN_MONTHLY_GHS.GROWTH + GROWTH_STOREFRONT_ADDON_GHS),
    proAnnualGhs: annualContractGhs(PLAN_MONTHLY_GHS.PRO),
    starterMonthlyPesewas: ghsToPesewas(PLAN_MONTHLY_GHS.STARTER),
  } as const;
}

export function formatControlGhs(amountGhs: number, currency: string = CONTROL_MONEY_CURRENCY): string {
  assertSupportedCurrency(currency);
  return `GHS ${amountGhs.toLocaleString('en-GH')}`;
}

export const FORBIDDEN_MOCK_PORTFOLIO_IDS = [
  'adom-mart',
  'sunrise-provisions',
  'harvest-square',
  'green-basket',
  'market-hub',
  'harbor-value',
  'orchid-retail',
  'capstone-grocers',
  'royal-stores',
  'union-fairprice',
] as const;
