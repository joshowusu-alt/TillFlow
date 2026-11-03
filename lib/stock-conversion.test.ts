import { describe, expect, it } from 'vitest';
import { conversionQuantity, planStockConversion } from './stock-conversion';
import { issueStockValue } from './inventory-value';

const bags = { qtyOnHandBase: 10, avgCostBasePence: 50000, knownValuePence: 500000, unvaluedQtyBase: 0 };
describe('cost-preserving stock conversion', () => {
  it('moves a bag into the counted cups without manufacturing value', () => {
    const result = planStockConversion(bags, null, 1, 95);
    expect(result.costPence).toBe(50000);
    expect(result.sourceAfter).toMatchObject({ qtyOnHandBase: 9, knownValuePence: 450000 });
    expect(result.destinationAfter).toMatchObject({ qtyOnHandBase: 95, knownValuePence: 50000, unvaluedQtyBase: 0 });
    let stock = result.destinationAfter; let sold = 0;
    for (let i = 0; i < 95; i++) { const sale = issueStockValue(stock, 1, stock.avgCostBasePence); sold += sale.costPence; stock = sale.after; }
    expect(sold).toBe(50000);
    expect(stock).toMatchObject({ qtyOnHandBase: 0, knownValuePence: 0 });
  });
  it('uses actual yield and source value, combining existing destination stock exactly', () => {
    const result = planStockConversion(bags, { qtyOnHandBase: 5, avgCostBasePence: 400, knownValuePence: 2000, unvaluedQtyBase: 0 }, 1, 100);
    expect(result.destinationAfter.knownValuePence).toBe(52000);
    expect(result.destinationAfter.qtyOnHandBase).toBe(105);
    expect(result.sourceAfter.knownValuePence! + result.destinationAfter.knownValuePence!).toBe(502000);
  });
  it('supports a carton cost without multiplying it a second time', () => {
    const result = planStockConversion({ qtyOnHandBase: 6, avgCostBasePence: 23000 }, null, 3, 72);
    expect(result.costPence).toBe(69000);
    expect(result.destinationAfter.knownValuePence).toBe(69000);
    expect(result.destinationAfter.avgCostBasePence).toBe(958);
    expect(result.sourceCostMethod).toBe('stored-weighted-average');
  });
  it('does not cure unknown destination stock by adding a valued conversion', () => {
    const result = planStockConversion(bags, { qtyOnHandBase: 10, avgCostBasePence: 400, knownValuePence: null, unvaluedQtyBase: 10 }, 1, 95);
    expect(result.destinationValueIncomplete).toBe(true);
    expect(result.destinationAfter.knownValuePence).toBeNull();
  });
  it('permits evidenced zero cost, but rejects unknown source cost and negative destination stock', () => {
    expect(planStockConversion({ qtyOnHandBase: 1, avgCostBasePence: 0, knownValuePence: 0, unvaluedQtyBase: 0 }, null, 1, 10).costPence).toBe(0);
    expect(() => planStockConversion({ qtyOnHandBase: 1, avgCostBasePence: 0 }, null, 1, 10)).toThrow(/cost/);
    expect(() => planStockConversion({ ...bags, unvaluedQtyBase: 1 }, null, 1, 10)).toThrow(/cost/);
    expect(() => planStockConversion(bags, { qtyOnHandBase: -1, avgCostBasePence: 100 }, 1, 10)).toThrow(/negative/);
  });
  it.each([0, -1, 1.1, NaN, Infinity, 2147483648])('refuses malformed or overflowing quantity %s', qty => {
    expect(() => conversionQuantity(qty, 1)).toThrow();
  });
  it('refuses overselling and multiplication overflow', () => {
    expect(() => planStockConversion(bags, null, 11, 100)).toThrow(/Not enough/);
    expect(() => conversionQuantity(1000000000, 3)).toThrow();
  });
});
