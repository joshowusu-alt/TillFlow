import { hasCompleteValue, issueStockValue, receiveStockValue, type StockValue } from '@/lib/inventory-value';

export type ConversionProduct = {
  id: string;
  name: string;
  units: { id: string; name: string; conversionToBase: number }[];
  stock: StockValue | null;
};

export function conversionQuantity(quantity: number, conversion: number) {
  const total = quantity * conversion;
  if (![quantity, conversion, total].every(n => Number.isSafeInteger(n) && n > 0 && n <= 2147483647)) {
    throw new Error('Enter a positive whole quantity within the supported range.');
  }
  return total;
}

/** Transfer the recorded source cost, never the destination's default buying price. */
export function planStockConversion(source: StockValue | null, destination: StockValue | null, usedBase: number, producedBase: number) {
  conversionQuantity(usedBase, 1);
  conversionQuantity(producedBase, 1);
  if (!source || source.qtyOnHandBase < usedBase) throw new Error('Not enough source stock. Record the purchase or review stock first.');
  if (!hasCompleteValue(source) && ((source.unvaluedQtyBase ?? 0) > 0 || source.avgCostBasePence <= 0)) {
    throw new Error('Review the source stock cost before converting it.');
  }
  if (destination && destination.qtyOnHandBase < 0) throw new Error('Review negative destination stock before converting.');
  const issued = issueStockValue(source, usedBase, source.avgCostBasePence);
  const start = destination?.qtyOnHandBase === 0 ? { qtyOnHandBase: 0, avgCostBasePence: 0, knownValuePence: 0, unvaluedQtyBase: 0 } : destination;
  const received = receiveStockValue(start ?? undefined, producedBase, issued.costPence);
  return {
    costPence: issued.costPence,
    costBasis: issued.costBasis,
    sourceAfter: issued.after,
    destinationAfter: received,
    sourceCostMethod: hasCompleteValue(source) ? 'confirmed-stock-value' : 'stored-weighted-average',
    destinationValueIncomplete: !hasCompleteValue(received),
  };
}
