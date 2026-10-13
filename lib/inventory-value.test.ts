import { describe, expect, it } from 'vitest';
import { allocateLineValues, hasCompleteValue, INVENTORY_VALUE_V1, issueStockValue, receiveStockValue, roundValueRatio, UNVERIFIED_STOCK_V1 } from './inventory-value';

describe('exact weighted-average stock value', () => {
  it('restores a returned item at its original cost after a more expensive receipt', () => {
    const first = receiveStockValue(undefined, 1, 1000);
    const sale = issueStockValue(first, 1, 1000);
    const restocked = receiveStockValue(sale.after, 1, 2000);
    const returned = receiveStockValue(restocked, 1, sale.costPence);
    expect(returned).toEqual({ qtyOnHandBase: 2, knownValuePence: 3000, unvaluedQtyBase: 0, avgCostBasePence: 1500 });
  });
  it('retains the full pack cost and consumes its rounding remainder', () => {
    let value = receiveStockValue(undefined, 3, 1000);
    const costs: number[] = [];
    for (let i = 0; i < 3; i++) { const sale = issueStockValue(value, 1, value.avgCostBasePence); costs.push(sale.costPence); value = sale.after; }
    expect(costs).toEqual([333, 334, 333]);
    expect(value.knownValuePence).toBe(0);
    expect(costs.reduce((a, b) => a + b)).toBe(1000);
  });
  it('allows selling stock with unknown costs without inventing profit evidence', () => {
    const mixed = receiveStockValue(receiveStockValue(undefined, 1, 1000), 1, null);
    expect(hasCompleteValue(mixed)).toBe(false);
    const sale = issueStockValue(mixed, 1, 1000);
    expect(sale).toMatchObject({ costPence: 0, costBasis: UNVERIFIED_STOCK_V1, after: { knownValuePence: null, unvaluedQtyBase: 1 } });
  });
  it('does not certify old balances using a rounded average', () => {
    const value = receiveStockValue({ qtyOnHandBase: 3, avgCostBasePence: 333 }, 1, 400);
    expect(value.knownValuePence).toBeNull();
    expect(hasCompleteValue(value)).toBe(false);
  });
  it('does not lose unknown-cost evidence after a subsequent costed purchase', () => {
    const mixed = receiveStockValue(receiveStockValue(undefined, 1, 1000), 1, null);
    const sold = issueStockValue(mixed, 1, 1000);
    const restocked = receiveStockValue(sold.after, 1, 2000);
    expect(restocked.unvaluedQtyBase).toBe(2);
    expect(issueStockValue(restocked, 1, 1500).costBasis).toBe(UNVERIFIED_STOCK_V1);
  });
  it('distinguishes a verified zero allocation from missing cost', () => {
    const sale = issueStockValue(receiveStockValue(undefined, 3, 1), 1, 0);
    expect(sale).toMatchObject({ costPence: 0, costBasis: INVENTORY_VALUE_V1 });
  });
  it('conserves value across arbitrary partitions of a fully costed pool', () => {
    for (let qty = 1; qty <= 30; qty++) for (let amount = 0; amount <= 100; amount++) {
      let value = receiveStockValue(undefined, qty, amount); let out = 0;
      while (value.qtyOnHandBase > 0) {
        const sale = issueStockValue(value, Math.min(3, value.qtyOnHandBase), value.avgCostBasePence);
        out += sale.costPence; value = sale.after;
        expect(out + value.knownValuePence!).toBe(amount);
      }
    }
  });
  it('allocates exact cart costs without losing a pesewa', () => {
    expect(allocateLineValues(1000, [1, 1, 1])).toEqual([333, 333, 334]);
    expect(allocateLineValues(1, [1, 1, 1]).reduce((a, b) => a + b)).toBe(1);
  });
  it('rejects overselling and amounts outside database bounds before posting', () => {
    expect(() => issueStockValue(receiveStockValue(undefined, 1, 100), 2, 100)).toThrow('Insufficient stock');
    expect(() => receiveStockValue(undefined, 1, 2147483648)).toThrow('Invalid');
    expect(() => roundValueRatio(2147483647, 2, 1)).toThrow('Invalid');
  });
});
