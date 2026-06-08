import { describe, expect, it } from 'vitest';
import {
  computeSubscriptionPricing,
  resolveAddonForPlan,
  resolveRegisterPlanSelection,
} from './plan-pricing';

describe('computeSubscriptionPricing', () => {
  it('Starter = GHS 199, ignores add-on', () => {
    const p = computeSubscriptionPricing({ plan: 'STARTER', addonOnlineStorefront: true });
    expect(p.basePlanMonthlyGhs).toBe(199);
    expect(p.addOnMonthlyGhs).toBe(0);
    expect(p.totalMonthlyGhs).toBe(199);
    expect(p.totalAnnualGhs).toBe(1990);
    expect(p.storefrontMode).toBe('none');
    expect(p.totalMonthlyBillingAmount).toBe(19900);
  });

  it('Growth without add-on = GHS 349', () => {
    const p = computeSubscriptionPricing({ plan: 'GROWTH', addonOnlineStorefront: false });
    expect(p.totalMonthlyGhs).toBe(349);
    expect(p.totalAnnualGhs).toBe(3490);
    expect(p.storefrontMode).toBe('none');
  });

  it('Growth + Online Storefront = GHS 549', () => {
    const p = computeSubscriptionPricing({ plan: 'GROWTH', addonOnlineStorefront: true });
    expect(p.addOnMonthlyGhs).toBe(200);
    expect(p.totalMonthlyGhs).toBe(549);
    expect(p.totalAnnualGhs).toBe(5490);
    expect(p.storefrontMode).toBe('addon');
  });

  it('Pro = GHS 699 included, ignores add-on flag', () => {
    const p = computeSubscriptionPricing({ plan: 'PRO', addonOnlineStorefront: true });
    expect(p.totalMonthlyGhs).toBe(699);
    expect(p.totalAnnualGhs).toBe(6990);
    expect(p.storefrontMode).toBe('included');
    expect(p.addOnMonthlyGhs).toBe(0);
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
  it('Growth add-on checked persists addon and GHS 549 billing amount', () => {
    const r = resolveRegisterPlanSelection('GROWTH', true);
    expect(r.addonOnlineStorefront).toBe(true);
    expect(r.pricing.totalMonthlyGhs).toBe(549);
    expect(r.pricing.totalMonthlyBillingAmount).toBe(54900);
  });

  it('Growth without add-on sets GHS 349', () => {
    const r = resolveRegisterPlanSelection('GROWTH', false);
    expect(r.addonOnlineStorefront).toBe(false);
    expect(r.pricing.totalMonthlyGhs).toBe(349);
  });

  it('Pro clears add-on and sets GHS 699', () => {
    const r = resolveRegisterPlanSelection('PRO', true);
    expect(r.addonOnlineStorefront).toBe(false);
    expect(r.pricing.totalMonthlyGhs).toBe(699);
  });

  it('Starter clears add-on and sets GHS 199', () => {
    const r = resolveRegisterPlanSelection('STARTER', true);
    expect(r.addonOnlineStorefront).toBe(false);
    expect(r.pricing.totalMonthlyGhs).toBe(199);
  });
});
