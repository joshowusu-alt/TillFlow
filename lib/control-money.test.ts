import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_MOCK_PORTFOLIO_IDS,
  UnsupportedBillingCurrencyError,
  annualContractGhs,
  assertSupportedCurrency,
  formatControlGhs,
  ghsToPesewas,
  knownCatalogExamples,
  paidArrGhs,
} from './control-money';

describe('control money boundary', () => {
  it('uses whole GHS catalog examples, not pesewas or major/minor mixups', () => {
    const examples = knownCatalogExamples();
    expect(examples.starterMonthlyGhs).toBe(199);
    expect(examples.growthMonthlyGhs).toBe(349);
    expect(examples.growthStorefrontMonthlyGhs).toBe(549);
    expect(examples.proMonthlyGhs).toBe(699);
    expect(examples.starterAnnualGhs).toBe(1990);
    expect(examples.growthStorefrontAnnualGhs).toBe(5490);
    expect(examples.starterMonthlyPesewas).toBe(19900);
    expect(formatControlGhs(199)).toBe('GHS 199');
    expect(formatControlGhs(199)).not.toBe('GHS 1.99');
    expect(formatControlGhs(199)).not.toBe('GHS 19,900');
    expect(ghsToPesewas(199)).toBe(19900);
  });

  it('does not overstate ARR for mixed monthly and annual billing', () => {
    const monthlyStarter = paidArrGhs({ monthlyValueGhs: 199, billingCadence: 'MONTHLY' });
    const annualGrowth = paidArrGhs({ monthlyValueGhs: 349, billingCadence: 'ANNUAL' });
    expect(monthlyStarter).toBe(2388);
    expect(annualGrowth).toBe(3490);
    expect(annualGrowth).not.toBe(349 * 12);
    expect(annualContractGhs(549)).toBe(5490);
  });

  it('fails closed on unsupported currency', () => {
    expect(assertSupportedCurrency('GHS')).toBe('GHS');
    expect(() => assertSupportedCurrency('USD')).toThrow(UnsupportedBillingCurrencyError);
  });

  it('lists mock portfolio IDs so operational screens can forbid them', () => {
    expect(FORBIDDEN_MOCK_PORTFOLIO_IDS).toContain('adom-mart');
    expect(FORBIDDEN_MOCK_PORTFOLIO_IDS).toHaveLength(10);
  });
});
