import type { PaymentInput } from '@/lib/services/shared/payment-utils';

/** Largest remainders preserve every pesewa, even for differently priced books. */
export function allocateCostByQuantity(amountPence: number, quantities: number[]): number[] {
  if (!Number.isSafeInteger(amountPence) || amountPence < 0) throw new Error('Enter a valid additional cost.');
  if (!quantities.length || quantities.some(q => !Number.isSafeInteger(q) || q <= 0)) throw new Error('Quantities must be positive whole base units.');
  const total = quantities.reduce((a, b) => a + BigInt(b), BigInt(0));
  const shares = quantities.map((quantity, index) => { const weighted = BigInt(amountPence) * BigInt(quantity); return { index, amount: Number(weighted / total), remainder: weighted % total }; });
  const remaining = amountPence - shares.reduce((sum, share) => sum + share.amount, 0);
  const order = [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; i < remaining; i++) order[i].amount++;
  return shares.map(share => share.amount);
}

/** Split actual tender across goods and a separately expensed charge, never copy it. */
export function splitPurchaseTender(payments: PaymentInput[], goodsTotal: number, cost: number) {
  const total = goodsTotal + cost;
  const paid = payments.reduce((sum, payment) => sum + payment.amountPence, 0);
  if (paid > total) throw new Error('Payment exceeds total due');
  const costPaid = total === 0 ? 0 : Number(BigInt(paid) * BigInt(cost) / BigInt(total));
  let remainingCostPaid = costPaid;
  const goods: PaymentInput[] = [], expenses: PaymentInput[] = [];
  for (const payment of payments) {
    const share = Math.min(payment.amountPence, remainingCostPaid);
    if (share) expenses.push({ ...payment, amountPence: share });
    if (payment.amountPence > share) goods.push({ ...payment, amountPence: payment.amountPence - share });
    remainingCostPaid -= share;
  }
  return { goods, expenses, costPaid };
}
