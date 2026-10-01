/**
 * How Today's payment mix may be drawn.
 * Amounts stay as recorded. Shares are omitted when they would not add up.
 */
export type PaymentMixPresentation = {
  shares: Array<number | null>;
  showBar: boolean;
};

export function paymentMixPresentation(amounts: readonly number[]): PaymentMixPresentation {
  const hidden = { shares: amounts.map(() => null), showBar: false };
  if (amounts.length === 0) return hidden;
  if (amounts.some((amount) => !Number.isFinite(amount))) return hidden;
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  if (!Number.isFinite(total) || total <= 0) return hidden;
  if (amounts.some((amount) => amount < 0)) return hidden;

  return {
    shares: amounts.map((amount) => {
      if (amount === 0) return null;
      const share = Math.round((amount / total) * 100);
      if (!Number.isFinite(share) || share < 0) return null;
      return share;
    }),
    showBar: true,
  };
}
