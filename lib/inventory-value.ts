export const INVENTORY_VALUE_V1 = 'INVENTORY_VALUE_V1';
export const UNVERIFIED_STOCK_V1 = 'UNVERIFIED_STOCK_V1';

export type StockValue = {
  qtyOnHandBase: number;
  avgCostBasePence: number;
  knownValuePence?: number | null;
  unvaluedQtyBase?: number | null;
};

function integer(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

export function roundValueRatio(value: number, numerator: number, denominator: number) {
  integer(value, 'stock value'); integer(numerator, 'quantity');
  if (!Number.isSafeInteger(denominator) || denominator <= 0) throw new Error('Invalid valuation denominator.');
  const result = (BigInt(value) * BigInt(numerator) * 2n + BigInt(denominator)) / (2n * BigInt(denominator));
  return integer(Number(result), 'allocated stock value');
}

export function hasTrackedValue(stock: StockValue): boolean {
  return stock.knownValuePence != null && stock.unvaluedQtyBase != null;
}

export function hasCompleteValue(stock: StockValue): boolean {
  return hasTrackedValue(stock) && stock.unvaluedQtyBase === 0 && stock.qtyOnHandBase >= 0;
}

/** Missing rows start empty. NULL legacy values are never reconstructed from a rounded average. */
export function receiveStockValue(before: StockValue | undefined, qty: number, value: number | null, unknownQty = value == null ? qty : 0): StockValue {
  integer(qty, 'received quantity');
  if (qty <= 0) throw new Error('Received quantity must be positive.');
  if (value != null) integer(value, 'received value');
  integer(unknownQty, 'unknown received quantity');
  if (unknownQty > qty) throw new Error('Unknown quantity exceeds received quantity.');
  const start = before ?? { qtyOnHandBase: 0, avgCostBasePence: 0, knownValuePence: 0, unvaluedQtyBase: 0 };
  const newQty = start.qtyOnHandBase + qty;
  if (!Number.isSafeInteger(newQty) || Math.abs(newQty) > 2147483647) throw new Error('Invalid stock quantity.');
  if (start.qtyOnHandBase < 0 || newQty < 0) return {
    qtyOnHandBase: newQty, avgCostBasePence: newQty > 0 && value != null ? Math.round(value / newQty) : 0,
    knownValuePence: null, unvaluedQtyBase: null,
  };
  if (!hasTrackedValue(start)) {
    const oldValue = Math.max(start.qtyOnHandBase, 0) * start.avgCostBasePence;
    const avg = value == null ? start.avgCostBasePence : Math.round((oldValue + value) / newQty);
    return { qtyOnHandBase: newQty, avgCostBasePence: avg, knownValuePence: null,
      unvaluedQtyBase: unknownQty > 0 ? newQty : null };
  }
  const knownValuePence = integer(start.knownValuePence! + (value ?? 0), 'known stock value');
  const unvaluedQtyBase = integer(start.unvaluedQtyBase! + unknownQty, 'unvalued quantity');
  const valuedQty = newQty - unvaluedQtyBase;
  return { qtyOnHandBase: newQty, knownValuePence, unvaluedQtyBase,
    avgCostBasePence: unvaluedQtyBase > 0
      ? start.avgCostBasePence > 0 ? start.avgCostBasePence : value != null && qty > unknownQty ? roundValueRatio(value, 1, qty - unknownQty) : 0
      : valuedQty > 0 ? roundValueRatio(knownValuePence, 1, valuedQty) : 0 };
}

export function issueStockValue(before: StockValue, qty: number, legacyUnitCost: number) {
  integer(qty, 'issued quantity');
  const newQty = before.qtyOnHandBase - qty;
  if (qty <= 0 || newQty < 0) throw new Error('Insufficient stock on hand.');
  if (hasCompleteValue(before)) {
    const costPence = roundValueRatio(before.knownValuePence!, qty, before.qtyOnHandBase);
    const knownValuePence = before.knownValuePence! - costPence;
    return { costPence, costBasis: INVENTORY_VALUE_V1, after: {
      qtyOnHandBase: newQty, knownValuePence, unvaluedQtyBase: 0,
      avgCostBasePence: newQty > 0 ? roundValueRatio(knownValuePence, 1, newQty) : 0,
    } };
  }
  if (hasTrackedValue(before) || (before.unvaluedQtyBase ?? 0) > 0) {
    // With unknown costs we cannot choose which money value left the mixed pool.
    // Sales remain available, but neither COGS nor remaining value is invented.
    return { costPence: 0, costBasis: UNVERIFIED_STOCK_V1, after: {
      qtyOnHandBase: newQty, avgCostBasePence: before.avgCostBasePence,
      knownValuePence: before.knownValuePence === 0 ? 0 : null, unvaluedQtyBase: newQty,
    } };
  }
  return { costPence: integer(legacyUnitCost * qty, 'legacy sale cost'), costBasis: null,
    after: { ...before, qtyOnHandBase: newQty, knownValuePence: null, unvaluedQtyBase: null } };
}

/** Allocate one product's exact outflow across its cart lines; the last line gets the remainder. */
export function allocateLineValues(total: number, quantities: number[]) {
  integer(total, 'line value');
  const quantity = quantities.reduce((sum, q) => sum + integer(q, 'line quantity'), 0);
  if (quantity <= 0) throw new Error('Line quantity must be positive.');
  let remaining = total;
  return quantities.map((q, index) => {
    const value = index === quantities.length - 1 ? remaining : Math.min(remaining, roundValueRatio(total, q, quantity));
    remaining -= value;
    return value;
  });
}

/** Reverse a recorded receipt at its original amount, without inventing a variance. */
export function removeRecordedStockValue(before: StockValue, qty: number, value: number): StockValue {
  integer(qty, 'returned quantity'); integer(value, 'returned value');
  const newQty = before.qtyOnHandBase - qty;
  if (qty <= 0 || newQty < 0) throw new Error('Insufficient stock on hand.');
  if (!hasCompleteValue(before)) return { ...before, qtyOnHandBase: newQty, knownValuePence: null, unvaluedQtyBase: newQty };
  const remaining = before.knownValuePence! - value;
  if (remaining < 0 || (newQty === 0 && remaining !== 0)) throw new Error('Review stock value before reversing this receipt; its original cost cannot reconcile with the remaining stock.');
  return { qtyOnHandBase: newQty, knownValuePence: remaining, unvaluedQtyBase: 0,
    avgCostBasePence: newQty > 0 ? roundValueRatio(remaining, 1, newQty) : 0 };
}
