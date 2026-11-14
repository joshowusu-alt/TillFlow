import type { StockValue } from '@/lib/inventory-value';
import { hasTrackedValue } from '@/lib/inventory-value';

export const LEFTOVER_REASON_CODES = ['END_OF_DAY_LEFTOVER', 'SPOILED'] as const;
export type LeftoverReasonCode = (typeof LEFTOVER_REASON_CODES)[number];

export const LEFTOVER_REASON_LABELS: Record<LeftoverReasonCode, string> = {
  END_OF_DAY_LEFTOVER: 'End-of-day leftover',
  SPOILED: 'Spoiled',
};

export function isLeftoverReasonCode(value: string): value is LeftoverReasonCode {
  return (LEFTOVER_REASON_CODES as readonly string[]).includes(value);
}

/** Declared cost of the thrown-away portions. Zero when the dish has no cost set. */
export function leftoverWriteOffValuePence(qty: number, costPerPortionPence: number | null | undefined): number {
  if (!Number.isInteger(qty) || qty < 1 || qty > 500) {
    throw new Error('Enter between 1 and 500 portions.');
  }
  const cost = costPerPortionPence ?? 0;
  if (!Number.isInteger(cost) || cost < 0) {
    throw new Error('Cost per portion cannot be negative.');
  }
  const value = qty * cost;
  if (!Number.isSafeInteger(value)) throw new Error('That write-off is too large.');
  return value;
}

/**
 * Remove counted portions. Unvalued cooked portions are taken first.
 * Known purchased value is left as it is: the journal, not this count, carries the declared cost.
 */
export function applyLeftoverQuantity(before: StockValue, qty: number): StockValue {
  if (!Number.isInteger(qty) || qty < 1) throw new Error('Enter how many portions were thrown away.');
  const newQty = before.qtyOnHandBase - qty;
  if (newQty < 0) throw new Error('There are not enough portions to write off.');
  if (!hasTrackedValue(before)) {
    return { ...before, qtyOnHandBase: newQty };
  }
  const unvalued = before.unvaluedQtyBase ?? 0;
  return {
    qtyOnHandBase: newQty,
    avgCostBasePence: before.avgCostBasePence,
    knownValuePence: before.knownValuePence ?? 0,
    unvaluedQtyBase: Math.max(0, unvalued - qty),
  };
}
