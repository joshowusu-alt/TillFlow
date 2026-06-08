import { describe, expect, it } from 'vitest';
import {
  computeSubscriptionPricing,
  resolveAddonForPlan,
  resolveControlCollectionAmountGhs,
  resolveRegisterPlanSelection,
} from './plan-pricing';

describe('computeSubscriptionPricing', () => {
  it('Starter monthly = GHS 199', () => {
    const p = computeSubscriptionPricing({ plan: 'STARTER', billingInterval: 'MONTHLY' });
    expect(p.totalMonthlyGhs).toBe(199);
    expect(p.totalDueGhs).toBe(199);
    expect(p.totalBillingAmount).toBe(19900);
    expect(p.annualSavingsGhs).toBe(398);
  });

  it('Starter annual = GHS 1,990 with savings', () => {
    const p = computeSubscriptionPricing({ plan: 'STARTER', billingInterval: 'ANNUAL' });
    expect(p.totalMonthlyGhs).toBe(199);
    expect(p.totalAnnualGhs).toBe(1990);
    expect(p.totalDueGhs).toBe(1990);
    expect(p.totalBillingAmount).toBe(199000);
    expect(p.annualSavingsGhs).toBe(398);
  });

  it('Starter ignores add-on flag', () => {
    const p = computeSubscriptionPricing({ plan: 'STARTER', addonOnlineStorefront: true, billingInterval: 'ANNUAL' });
    expect(p.totalDueGhs).toBe(1990);
    expect(p.storefrontMode).toBe('none');
  });

  it('Growth monthly = GHS 349', () => {
    const p = computeSubscriptionPricing({ plan: 'GROWTH', billingInterval: 'MONTHLY' });
    expect(p.totalMonthlyGhs).toBe(349);
    expect(p.totalDueGhs).toBe(349);
    expect(p.totalBillingAmount).toBe(34900);
  });

  it('Growth annual = GHS 3,490 with savings', () => {
    const p = computeSubscriptionPricing({ plan: 'GROWTH', billingInterval: 'ANNUAL' });
    expect(p.totalAnnualGhs).toBe(3490);
    expect(p.totalDueGhs).toBe(3490);
    expect(p.totalBillingAmount).toBe(349000);
    expect(p.annualSavingsGhs).toBe(698);
  });

  it('Growth + Online Storefront monthly = GHS 549', () => {
    const p = computeSubscriptionPricing({ plan: 'GROWTH', addonOnlineStorefront: true, billingInterval: 'MONTHLY' });
    expect(p.totalMonthlyGhs).toBe(549);
    expect(p.totalDueGhs).toBe(549);
    expect(p.totalBillingAmount).toBe(54900);
    expect(p.storefrontMode).toBe('addon');
  });

  it('Growth + Online Storefront annual = GHS 5,490 with savings', () => {
    const p = computeSubscriptionPricing({ plan: 'GROWTH', addonOnlineStorefront: true, billingInterval: 'ANNUAL' });
    expect(p.totalAnnualGhs).toBe(5490);
    expect(p.totalDueGhs).toBe(5490);
    expect(p.totalBillingAmount).toBe(549000);
    expect(p.annualSavingsGhs).toBe(1098);
  });

  it('Pro monthly = GHS 699', () => {
    const p = computeSubscriptionPricing({ plan: 'PRO', billingInterval: 'MONTHLY' });
    expect(p.totalMonthlyGhs).toBe(699);
    expect(p.totalDueGhs).toBe(699);
    expect(p.totalBillingAmount).toBe(69900);
    expect(p.storefrontMode).toBe('included');
  });

  it('Pro annual = GHS 6,990 with savings', () => {
    const p = computeSubscriptionPricing({ plan: 'PRO', billingInterval: 'ANNUAL' });
    expect(p.totalAnnualGhs).toBe(6990);
    expect(p.totalDueGhs).toBe(6990);
    expect(p.totalBillingAmount).toBe(699000);
    expect(p.annualSavingsGhs).toBe(1398);
  });

  it('Pro + add-on flag annual still = GHS 6,990', () => {
    const p = computeSubscriptionPricing({ plan: 'PRO', addonOnlineStorefront: true, billingInterval: 'ANNUAL' });
    expect(p.totalDueGhs).toBe(6990);
    expect(p.addOnMonthlyGhs).toBe(0);
  });

  it('annual savings = monthly total × 2', () => {
    const p = computeSubscriptionPricing({ plan: 'GROWTH', addonOnlineStorefront: true, billingInterval: 'ANNUAL' });
    expect(p.annualSavingsGhs).toBe(p.totalMonthlyGhs * 2);
    expect(p.annualComparisonGhs).toBe(p.totalMonthlyGhs * 12);
  });
});

describe('resolveAddonForPlan', () => {
  it('only Growth may select add-on', () => {
    expect(resolveAddonForPlan('GROWTH', true)).toBe(true);
    expect(resolveAddonForPlan('GROWTH', false)).toBe(false);
    expect(resolveAddonForPlan('STARTER', true)).toBe(false);
    expect(resolveAddonForPlan('PRO', true)).toBe(false);
  });
});

describe('resolveRegisterPlanSelection', () => {
  it('monthly Growth add-on persists addonOnlineStorefront=true and billingAmount=54900', () => {
    const r = resolveRegisterPlanSelection('GROWTH', true, 'MONTHLY');
    expect(r.addonOnlineStorefront).toBe(true);
    expect(r.billingInterval).toBe('MONTHLY');
    expect(r.pricing.totalBillingAmount).toBe(54900);
  });

  it('annual Growth add-on persists billingAmount=549000', () => {
    const r = resolveRegisterPlanSelection('GROWTH', true, 'ANNUAL');
    expect(r.addonOnlineStorefront).toBe(true);
    expect(r.billingInterval).toBe('ANNUAL');
    expect(r.pricing.totalBillingAmount).toBe(549000);
  });

  it('monthly Growth without add-on sets billingAmount=34900', () => {
    const r = resolveRegisterPlanSelection('GROWTH', false, 'MONTHLY');
    expect(r.pricing.totalBillingAmount).toBe(34900);
  });

  it('annual Growth without add-on sets billingAmount=349000', () => {
    const r = resolveRegisterPlanSelection('GROWTH', false, 'ANNUAL');
    expect(r.pricing.totalBillingAmount).toBe(349000);
  });

  it('monthly Pro clears add-on and sets billingAmount=69900', () => {
    const r = resolveRegisterPlanSelection('PRO', true, 'MONTHLY');
    expect(r.addonOnlineStorefront).toBe(false);
    expect(r.pricing.totalBillingAmount).toBe(69900);
  });

  it('annual Pro clears add-on and sets billingAmount=699000', () => {
    const r = resolveRegisterPlanSelection('PRO', true, 'ANNUAL');
    expect(r.pricing.totalBillingAmount).toBe(699000);
  });

  it('monthly Starter clears add-on and sets billingAmount=19900', () => {
    const r = resolveRegisterPlanSelection('STARTER', true, 'MONTHLY');
    expect(r.addonOnlineStorefront).toBe(false);
    expect(r.pricing.totalBillingAmount).toBe(19900);
  });

  it('annual Starter clears add-on and sets billingAmount=199000', () => {
    const r = resolveRegisterPlanSelection('STARTER', true, 'ANNUAL');
    expect(r.pricing.totalBillingAmount).toBe(199000);
  });
});

describe('resolveControlCollectionAmountGhs', () => {
  it('collects annual interval total, not monthly-only', () => {
    const amount = resolveControlCollectionAmountGhs({
      plan: 'GROWTH',
      addonOnlineStorefront: true,
      billingCadence: 'ANNUAL',
    });
    expect(amount).toBe(5490);
  });

  it('collects monthly Growth + add-on at GHS 549', () => {
    const amount = resolveControlCollectionAmountGhs({
      plan: 'GROWTH',
      addonOnlineStorefront: true,
      billingCadence: 'MONTHLY',
    });
    expect(amount).toBe(549);
  });
});
