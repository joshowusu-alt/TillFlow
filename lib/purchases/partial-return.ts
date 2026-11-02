/** Integer-only allocation: the last returned unit absorbs rounding residuals. */
export function allocatedReturnValue(totalPence: number, sourceQty: number, previouslyReturned: number, returnNow: number) {
  for (const value of [totalPence, sourceQty, previouslyReturned, returnNow]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid return allocation');
  }
  if (sourceQty === 0 || returnNow === 0 || previouslyReturned + returnNow > sourceQty) throw new Error('Return exceeds remaining source quantity');
  // BigInt avoids intermediate multiplication overflowing the safe integer range.
  const cumulative = (qty: number) => Number((BigInt(totalPence) * BigInt(qty) + BigInt(Math.floor(sourceQty / 2))) / BigInt(sourceQty));
  return cumulative(previouslyReturned + returnNow) - cumulative(previouslyReturned);
}

export function partialReturnSettlement(input: { invoiceTotalPence: number; paidPence: number; previousCreditsPence: number; newCreditPence: number; creditSettledPence?: number; creditAppliedPence?: number }) {
  for (const value of Object.values(input)) if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid supplier amounts');
  const remainingBefore = input.invoiceTotalPence - input.previousCreditsPence;
  if (remainingBefore < 0 || input.newCreditPence > remainingBefore) throw new Error('Credit exceeds remaining purchase value');
  const chargeAfter = remainingBefore - input.newCreditPence;
  return {
    chargeAfterPence: chargeAfter,
    supplierDebtPence: Math.max(0, chargeAfter + (input.creditSettledPence ?? 0) - (input.creditAppliedPence ?? 0) - input.paidPence),
    supplierCreditPence: Math.max(0, input.paidPence + (input.creditAppliedPence ?? 0) - (input.creditSettledPence ?? 0) - chargeAfter),
    cashReceivedPence: 0,
  };
}
