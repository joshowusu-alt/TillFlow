import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { preparedPortionReceipt } from '@/lib/food/prepare-portions';

describe('prepared portions', () => {
  it('adds cooked portions without creating inventory value', () => {
    const receipt = preparedPortionReceipt(undefined, 12);
    expect(receipt.journal).toBeNull();
    expect(receipt.movement).toEqual({
      type: 'FOOD_PREPARATION',
      qtyBase: 12,
      valuePence: null,
      costBasis: 'UNVERIFIED_STOCK_V1',
    });
    expect(receipt.after.qtyOnHandBase).toBe(12);
    expect(receipt.after.knownValuePence).toBe(0);
    expect(receipt.after.unvaluedQtyBase).toBe(12);
  });

  it('does not add the cooked pot onto a balance that already has a known cost', () => {
    const receipt = preparedPortionReceipt(
      { qtyOnHandBase: 4, avgCostBasePence: 800, knownValuePence: 3200, unvaluedQtyBase: 0 },
      6,
    );
    expect(receipt.journal).toBeNull();
    expect(receipt.after.qtyOnHandBase).toBe(10);
    expect(receipt.after.knownValuePence).toBe(3200);
    expect(receipt.after.unvaluedQtyBase).toBe(6);
  });

  it('is not posted as an inventory gain or an opening balance', () => {
    const source = readFileSync(path.join(process.cwd(), 'lib/food/prepare-service.ts'), 'utf8');
    expect(source).toContain('preparedPortionReceipt');
    expect(source).toContain('FOOD_PREPARATION');
    expect(source).not.toContain('postJournalEntry');
    expect(source).not.toContain('OPENING_BALANCE');
    expect(source).not.toContain('inventoryGain');
    expect(source).not.toContain("direction: 'INCREASE'");
  });
});
