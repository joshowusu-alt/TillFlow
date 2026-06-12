import { describe, expect, it } from 'vitest';

import { assertDailySummaryFeatureFromSnapshot } from '@/lib/notifications/daily-summary-access';

describe('assertDailySummaryFeatureFromSnapshot', () => {
  it('allows Growth and Pro plans', () => {
    expect(assertDailySummaryFeatureFromSnapshot({ plan: 'GROWTH' })).toBe(true);
    expect(assertDailySummaryFeatureFromSnapshot({ plan: 'PRO', storeMode: 'MULTI_STORE' })).toBe(true);
  });

  it('blocks Starter plan access', () => {
    expect(assertDailySummaryFeatureFromSnapshot({ plan: 'STARTER' })).toBe(false);
  });

  it('allows legacy advanced mode businesses on Growth', () => {
    expect(assertDailySummaryFeatureFromSnapshot({ mode: 'ADVANCED', storeMode: 'SINGLE_STORE' })).toBe(true);
  });
});
