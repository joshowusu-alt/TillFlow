/**
 * Loyalty programme helpers — earn and redeem points using business settings.
 */

export type LoyaltyBusinessSettings = {
  loyaltyEnabled: boolean;
  loyaltyPointsPerGhsPence: number;
  loyaltyGhsPerHundredPoints: number;
};

export function computePointsEarned(
  totalPence: number,
  pointsPerGhsPence: number
): number {
  if (totalPence <= 0 || pointsPerGhsPence <= 0) return 0;
  return Math.floor(totalPence / 100) * pointsPerGhsPence;
}

/** Pesewas discount for a number of points (redeemed in blocks of 100). */
export function pointsToDiscountPence(
  points: number,
  pesewasPerHundredPoints: number
): number {
  if (points <= 0 || pesewasPerHundredPoints <= 0) return 0;
  return Math.floor(points / 100) * pesewasPerHundredPoints;
}

export function discountPenceToPointsRedeemed(
  discountPence: number,
  pesewasPerHundredPoints: number
): number {
  if (discountPence <= 0 || pesewasPerHundredPoints <= 0) return 0;
  const blocks = Math.floor(discountPence / pesewasPerHundredPoints);
  return blocks * 100;
}

export function maxRedeemablePoints(
  balance: number,
  netSubtotalPence: number,
  pesewasPerHundredPoints: number
): number {
  if (balance <= 0 || netSubtotalPence <= 0 || pesewasPerHundredPoints <= 0) return 0;
  const maxByTotal = discountPenceToPointsRedeemed(netSubtotalPence, pesewasPerHundredPoints);
  return Math.min(balance, maxByTotal);
}

export function clampLoyaltyRedemption(input: {
  pointsToRedeem: number;
  balance: number;
  netSubtotalPence: number;
  settings: LoyaltyBusinessSettings;
}): { pointsRedeemed: number; discountPence: number } {
  const { settings, balance, netSubtotalPence } = input;
  if (!settings.loyaltyEnabled) {
    return { pointsRedeemed: 0, discountPence: 0 };
  }

  const requested = Math.max(0, Math.floor(input.pointsToRedeem));
  const capped = Math.min(
    requested,
    maxRedeemablePoints(balance, netSubtotalPence, settings.loyaltyGhsPerHundredPoints)
  );
  const discountPence = pointsToDiscountPence(capped, settings.loyaltyGhsPerHundredPoints);
  const pointsRedeemed = discountPenceToPointsRedeemed(
    discountPence,
    settings.loyaltyGhsPerHundredPoints
  );

  return { pointsRedeemed, discountPence };
}
