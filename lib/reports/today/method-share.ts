/**
 * Percentage of a payment method inside Today's mix.
 * Omit the figure when it would be zero, negative, or not a finite positive share.
 * This does not change how money received is calculated.
 */
export function paymentMethodSharePercent(amountPence: number, totalPence: number): number | null {
  if (!Number.isFinite(amountPence) || !Number.isFinite(totalPence)) return null;
  if (totalPence <= 0 || amountPence <= 0) return null;
  const share = Math.round((amountPence / totalPence) * 100);
  if (!Number.isFinite(share) || share <= 0) return null;
  return share;
}
