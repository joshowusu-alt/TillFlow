import { describe, expect, it } from 'vitest';

import {
  clampLoyaltyRedemption,
  computePointsEarned,
  pointsToDiscountPence,
} from './loyalty';

describe('loyalty helpers', () => {
  it('computes earn rate from invoice total', () => {
    expect(computePointsEarned(10_00, 1)).toBe(10);
    expect(computePointsEarned(99, 5)).toBe(0);
  });

  it('converts points to discount in hundreds', () => {
    expect(pointsToDiscountPence(250, 100)).toBe(200);
    expect(pointsToDiscountPence(50, 100)).toBe(0);
  });

  it('caps redemption by balance and order total', () => {
    const result = clampLoyaltyRedemption({
      pointsToRedeem: 500,
      balance: 300,
      netSubtotalPence: 500,
      settings: {
        loyaltyEnabled: true,
        loyaltyPointsPerGhsPence: 1,
        loyaltyGhsPerHundredPoints: 100,
      },
    });
    expect(result.pointsRedeemed).toBe(300);
    expect(result.discountPence).toBe(300);
  });
});
