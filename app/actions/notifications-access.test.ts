import { describe, expect, it } from 'vitest';

import { assertDailySummaryFeatureFromSnapshot } from '@/lib/notifications/daily-summary-access';

describe('notifications action access expectations', () => {
  it('blocks Starter businesses from Daily Owner Summary features', () => {
    expect(assertDailySummaryFeatureFromSnapshot({ plan: 'STARTER' })).toBe(false);
  });

  it('allows Growth and Pro regardless of billing interval semantics', () => {
    expect(assertDailySummaryFeatureFromSnapshot({ plan: 'GROWTH' })).toBe(true);
    expect(assertDailySummaryFeatureFromSnapshot({ plan: 'PRO' })).toBe(true);
  });
});
