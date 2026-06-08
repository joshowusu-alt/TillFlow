import { describe, expect, it } from 'vitest';
import {
  computeSubscriptionPricing,
  resolveControlMonthlyValueGhs,
  storefrontPricingSummary,
} from '@/lib/vendor/plan-pricing';

describe('control plan pricing', () => {
  it('displays Growth + add-on monthly charge as GHS 549', () => {
    const pricing = computeSubscriptionPricing({ plan: 'GROWTH', addonOnlineStorefront: true });
    const summary = storefrontPricingSummary(pricing, false);

    expect(pricing.totalMonthlyGhs).toBe(549);
    expect(summary.storefrontLine).toContain('Add-on selected');
    expect(summary.monthlyLine).toBe('Monthly charge: GHS 549');
    expect(summary.annualLine).toBe('Annual equivalent: GHS 5490');
  });

  it('displays Pro as included storefront', () => {
    const pricing = computeSubscriptionPricing({ plan: 'PRO' });
    const summary = storefrontPricingSummary(pricing, true);

    expect(summary.storefrontLine).toBe('Storefront: Included');
    expect(summary.monthlyLine).toBe('Monthly charge: GHS 699');
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
});
