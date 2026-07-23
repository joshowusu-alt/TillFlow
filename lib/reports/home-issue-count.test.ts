import { describe, expect, it } from 'vitest';
import { countCommandCenterIssueFlags } from '@/lib/reports/home-issue-count';
import type { HomeIssueFlagSource } from '@/lib/reports/home-issue-count';

function flags(partial: Partial<HomeIssueFlagSource>): HomeIssueFlagSource {
  return {
    stockoutImminentCount: 0,
    urgentReorderCount: 0,
    arOver60Pence: 0,
    outstandingAPPence: 0,
    cashVarianceTotalPence: 0,
    momoPendingCount: 0,
    negativeMarginProductCount: 0,
    discountOverrideCount: 0,
    openHighAlerts: 0,
    ...partial,
  };
}

describe('countCommandCenterIssueFlags', () => {
  it('matches historical getReadiness openIssueCount derivation (0–9 flags)', () => {
    expect(countCommandCenterIssueFlags(flags({}))).toBe(0);
    expect(countCommandCenterIssueFlags(flags({ urgentReorderCount: 3 }))).toBe(1);
    expect(
      countCommandCenterIssueFlags(
        flags({
          stockoutImminentCount: 1,
          urgentReorderCount: 2,
          arOver60Pence: 100,
          outstandingAPPence: 50,
          cashVarianceTotalPence: 10,
          momoPendingCount: 1,
          negativeMarginProductCount: 1,
          discountOverrideCount: 1,
          openHighAlerts: 1,
        }),
      ),
    ).toBe(9);
  });

  it('counts each category once regardless of magnitude', () => {
    expect(countCommandCenterIssueFlags(flags({ openHighAlerts: 99 }))).toBe(1);
  });
});
