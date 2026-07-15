import { describe, expect, it } from 'vitest';
import { incompleteStockDisclosureMessage } from '@/lib/reports/incomplete-stock';
import type { IncompleteStockSnapshot } from '@/lib/reports/incomplete-stock';

function snap(overrides: Partial<IncompleteStockSnapshot> = {}): IncompleteStockSnapshot {
  return {
    productsWithUnvaluedQty: 0,
    unvaluedQtyBase: 0,
    costReviewProductIds: [],
    soldWithoutCostProductIds: [],
    allMissingCostProductIds: [],
    missingCostProductCount: 0,
    stockValueIncomplete: false,
    profitMayBeIncomplete: false,
    ...overrides,
  };
}

describe('incomplete-stock disclosure helpers', () => {
  it('describes stocked missing cost', () => {
    const message = incompleteStockDisclosureMessage(
      snap({
        productsWithUnvaluedQty: 2,
        costReviewProductIds: ['a', 'b'],
        allMissingCostProductIds: ['a', 'b'],
        missingCostProductCount: 2,
        stockValueIncomplete: true,
        profitMayBeIncomplete: true,
      })
    );
    expect(message).toMatch(/quantity without a confirmed cost/i);
  });

  it('describes sold-only missing cost without claiming stock qty', () => {
    const message = incompleteStockDisclosureMessage(
      snap({
        soldWithoutCostProductIds: ['sold-1'],
        allMissingCostProductIds: ['sold-1'],
        missingCostProductCount: 1,
        profitMayBeIncomplete: true,
        stockValueIncomplete: false,
      })
    );
    expect(message).toMatch(/sold without a reliable cost/i);
  });

  it('returns null when complete', () => {
    expect(incompleteStockDisclosureMessage(snap())).toBeNull();
  });
});
