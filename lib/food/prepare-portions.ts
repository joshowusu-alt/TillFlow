import type { StockValue } from '@/lib/inventory-value';
import { receiveStockValue, UNVERIFIED_STOCK_V1 } from '@/lib/inventory-value';

export const FOOD_PREPARATION_MOVEMENT = 'FOOD_PREPARATION';

/**
 * Cooked portions are an operational count.
 *
 * Inventory increase posts Dr 1200 Inventory / Cr 4100 Inventory Gain.
 * Opening stock posts Dr 1200 / Cr opening-balance equity.
 * Neither is honest for a pot that was cooked from ingredients TillFlow is
 * not tracking, so preparation does not post a journal at all.
 *
 * The quantity is received with unknown value. Known inventory value is left
 * untouched, and the movement is FOOD_PREPARATION rather than ADJUSTMENT or
 * OPENING. When the portion is later sold, an unverified count does not
 * invent a cost of goods figure.
 */
export function preparedPortionReceipt(before: StockValue | undefined, qty: number) {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error('Enter how many portions were cooked.');
  }
  const after = receiveStockValue(before, qty, null);
  return {
    after,
    movement: {
      type: FOOD_PREPARATION_MOVEMENT,
      qtyBase: qty,
      valuePence: null as number | null,
      costBasis: UNVERIFIED_STOCK_V1,
    },
    /** No ledger lines. Cooking is not income, equity, or a new inventory asset. */
    journal: null as null,
  };
}
