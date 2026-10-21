/** Percentage input is stored in basis points: 12.5% = 1250. */
export function purchaseDiscountBps(raw: unknown): number {
  if (raw === '' || raw == null) return 0;
  const text = String(raw).trim();
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(text)) throw new Error('Enter a discount from 0 to 100%, with up to two decimal places.');
  const bps = Math.round(Number(text) * 100);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new Error('Enter a discount from 0 to 100%.');
  return bps;
}

export function pricePurchaseLines(lines: { qtyInUnit: number; unitCostPence: number; discountBps?: number }[], invoiceDiscountBps = 0) {
  const validBps = (bps: number) => Number.isInteger(bps) && bps >= 0 && bps <= 10000;
  if (!validBps(invoiceDiscountBps)) throw new Error('Enter a discount from 0 to 100%.');
  const amounts = lines.map(line => {
    if (line.qtyInUnit <= 0) throw new Error('Quantity must be at least 1');
    if (!Number.isSafeInteger(line.qtyInUnit) || line.qtyInUnit <= 0 || !Number.isSafeInteger(line.unitCostPence) || line.unitCostPence < 0 || !validBps(line.discountBps ?? 0)) throw new Error('Enter valid quantities, costs and discounts.');
    const gross = line.qtyInUnit * line.unitCostPence;
    if (!Number.isSafeInteger(gross) || gross > 2147483647) throw new Error('Purchase amount is too large.');
    const lineDiscount = Math.round(gross * (line.discountBps ?? 0) / 10000);
    return { gross, lineDiscount, afterLine: gross - lineDiscount };
  });
  const beforeInvoice = amounts.reduce((sum, line) => sum + line.afterLine, 0);
  if (beforeInvoice > 2147483647) throw new Error('Purchase amount is too large.');
  const invoiceDiscount = Math.round(beforeInvoice * invoiceDiscountBps / 10000);
  const denominator = BigInt(beforeInvoice || 1);
  const numerators = amounts.map(line => BigInt(invoiceDiscount) * BigInt(line.afterLine));
  const shares = numerators.map(value => Number(value / denominator));
  let remainder = invoiceDiscount - shares.reduce((sum, share) => sum + share, 0);
  const order = numerators.map((value, index) => ({ index, fraction: value % denominator })).sort((a, b) => a.fraction === b.fraction ? a.index - b.index : a.fraction > b.fraction ? -1 : 1);
  for (const row of order) { if (!remainder) break; shares[row.index]++; remainder--; }
  return amounts.map((line, index) => ({ grossPence: line.gross, discountPence: line.lineDiscount + shares[index], netPence: line.afterLine - shares[index] }));
}
