import { describe, expect, it } from 'vitest';
import { getProductPriceWarnings } from './product-price-guards';

describe('getProductPriceWarnings', () => {
  it('warns when selling below cost', () => {
    const warnings = getProductPriceWarnings({
      sellingPricePence: 200,
      defaultCostBasePence: 300,
    });
    expect(warnings.some((w) => w.code === 'below_cost')).toBe(true);
  });

  it('warns when selling price matches opening stock qty', () => {
    const warnings = getProductPriceWarnings({
      sellingPricePence: 4800,
      defaultCostBasePence: 220,
      openingStockQty: 48,
    });
    expect(warnings.some((w) => w.code === 'price_matches_qty')).toBe(true);
  });

  it('does not warn on normal grocery pricing', () => {
    const warnings = getProductPriceWarnings({
      sellingPricePence: 300,
      defaultCostBasePence: 220,
      openingStockQty: 48,
    });
    expect(warnings).toHaveLength(0);
  });
});
