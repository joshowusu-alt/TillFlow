/**
 * Today money received is confirmed receipts minus completed refunds paid out
 * in the same window. A negative confirmed payment already reduces the receipt
 * total, so that amount is not subtracted again.
 */
export type MethodAmount = { method: string; amountPence: number };

export type CompletedRefund = {
  refundAmountPence: number;
  refundMethod: string | null;
  confirmedAmountsPence: readonly number[];
};

export function refundDeductionPence(refund: CompletedRefund): number {
  const alreadyReversed = refund.confirmedAmountsPence
    .filter((amount) => amount < 0)
    .reduce((sum, amount) => sum + Math.abs(amount), 0);
  return Math.max(0, refund.refundAmountPence - alreadyReversed);
}

export function applyRefundsToMethods(
  methods: readonly MethodAmount[],
  refunds: readonly CompletedRefund[],
): MethodAmount[] {
  const totals = new Map<string, number>();
  for (const row of methods) {
    totals.set(row.method, (totals.get(row.method) ?? 0) + row.amountPence);
  }
  for (const refund of refunds) {
    const deduction = refundDeductionPence(refund);
    if (deduction === 0) continue;
    if (!refund.refundMethod) {
      throw new Error('Completed refund is missing a payment method');
    }
    totals.set(refund.refundMethod, (totals.get(refund.refundMethod) ?? 0) - deduction);
  }
  return [...totals.entries()].map(([method, amountPence]) => ({ method, amountPence }));
}
