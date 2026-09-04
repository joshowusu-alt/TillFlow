import { describe, expect, it } from 'vitest';
import {
  computeSubscriptionPricing,
  controlIntervalChargeGhs,
  controlMonthlyValueGhs,
  resolveControlCollectionAmountGhs,
  resolveControlPaymentAmounts,
  resolveControlMonthlyValueGhs,
  storefrontPricingSummary,
} from '@/lib/vendor/plan-pricing';

describe('control plan pricing', () => {
  it('displays Growth annual + add-on correctly', () => {
    const pricing = computeSubscriptionPricing({
      plan: 'GROWTH',
      addonOnlineStorefront: true,
      billingInterval: 'ANNUAL',
    });
    const summary = storefrontPricingSummary(pricing, false);

    expect(pricing.totalMonthlyGhs).toBe(549);
    expect(pricing.totalDueGhs).toBe(5490);
    expect(summary.storefrontLine).toContain('Add-on selected');
    expect(summary.billingLine).toBe('Billing: Annual');
    expect(summary.monthlyValueLine).toBe('Monthly value: GHS 549');
    expect(summary.intervalChargeLine).toBe('Annual charge: GHS 5,490/year');
    expect(summary.savingsLine).toBe('Saving: GHS 1,098');
  });

  it('displays Growth monthly without add-on', () => {
    const pricing = computeSubscriptionPricing({ plan: 'GROWTH', billingInterval: 'MONTHLY' });
    const summary = storefrontPricingSummary(pricing, false);

    expect(summary.billingLine).toBe('Billing: Monthly');
    expect(summary.intervalChargeLine).toBe('Current charge: GHS 349/month');
    expect(summary.savingsLine).toBeNull();
  });

  it('displays Pro annual as included storefront', () => {
    const pricing = computeSubscriptionPricing({ plan: 'PRO', billingInterval: 'ANNUAL' });
    const summary = storefrontPricingSummary(pricing, true);

    expect(summary.storefrontLine).toBe('Storefront: Included');
    expect(summary.intervalChargeLine).toBe('Annual charge: GHS 6,990/year');
    expect(summary.savingsLine).toBe('Saving: GHS 1,398');
    expect(summary.publishedLine).toBe('Storefront published: Yes');
  });

  it('self-heals stale Growth base monthly when add-on is active', () => {
    const monthly = resolveControlMonthlyValueGhs({
      plan: 'GROWTH',
      addonOnlineStorefront: true,
      storedMonthlyGhs: 349,
    });

    expect(monthly).toBe(549);
  });

  it('payment follow-up uses interval total for annual Growth + add-on', () => {
    const amount = resolveControlCollectionAmountGhs({
      plan: 'GROWTH',
      addonOnlineStorefront: true,
      billingCadence: 'ANNUAL',
    });

    expect(amount).toBe(5490);
  });

  it('monthlyValuePence convention stays monthly GHS', () => {
    const pricing = computeSubscriptionPricing({
      plan: 'GROWTH',
      addonOnlineStorefront: true,
      billingInterval: 'ANNUAL',
    });

    expect(controlMonthlyValueGhs(pricing)).toBe(549);
  });

  it('shows Starter storefront as "Not available", Growth-no-addon as "Not selected"', () => {
    const starter = storefrontPricingSummary(
      computeSubscriptionPricing({ plan: 'STARTER', billingInterval: 'MONTHLY' }),
      false,
      'STARTER',
    );
    const growth = storefrontPricingSummary(
      computeSubscriptionPricing({ plan: 'GROWTH', billingInterval: 'MONTHLY' }),
      false,
      'GROWTH',
    );

    expect(starter.storefrontLine).toBe('Storefront: Not available');
    expect(growth.storefrontLine).toBe('Storefront: Not selected');
  });

  it('rejects blank payment amounts instead of converting list price to pesewas', () => {
    const pricing = computeSubscriptionPricing({ plan: 'GROWTH', addonOnlineStorefront: true, billingInterval: 'ANNUAL' });
    expect(() => resolveControlPaymentAmounts(pricing)).toThrow(/explicit and greater than zero/);
    expect(resolveControlPaymentAmounts(pricing, 5490)).toEqual({
      recordedAmountGhs: 5490,
      businessBillingAmountPence: 549000,
    });
    expect(resolveControlPaymentAmounts(
      computeSubscriptionPricing({ plan: 'PRO', billingInterval: 'ANNUAL' }),
      6990,
    ).businessBillingAmountPence).toBe(699000);
    expect(resolveControlPaymentAmounts(
      computeSubscriptionPricing({ plan: 'GROWTH', addonOnlineStorefront: true, billingInterval: 'MONTHLY' }),
      549,
    ).businessBillingAmountPence).toBe(54900);
  });
});
