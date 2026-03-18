import { describe, expect, it } from 'vitest';

import {
  resolveEffectiveDefaultCostPence,
  resolveEffectiveSellingPricePence,
  resolveProductUnitBaseValuePence,
} from './product-unit-pricing';

describe('product unit pricing resolver', () => {
  const product = {
    sellingPriceBasePence: 400,
    defaultCostBasePence: 250,
  };

  it('falls back to base price and cost times conversion when overrides are missing', () => {
    const unit = { conversionToBase: 12 };

    expect(resolveEffectiveSellingPricePence(product, unit)).toBe(4800);
    expect(resolveEffectiveDefaultCostPence(product, unit)).toBe(3000);
  });

  it('prefers explicit unit overrides when configured', () => {
    const unit = {
      conversionToBase: 12,
      sellingPricePence: 4500,
      defaultCostPence: 2800,
    };

    expect(resolveEffectiveSellingPricePence(product, unit)).toBe(4500);
    expect(resolveEffectiveDefaultCostPence(product, unit)).toBe(2800);
  });

  it('keeps quarter, half, and whole pricing exact without decimal quantity math', () => {
    const packProduct = {
      sellingPriceBasePence: 1000,
      defaultCostBasePence: 600,
    };

    expect(
      resolveEffectiveSellingPricePence(packProduct, { conversionToBase: 1, sellingPricePence: 300 })
    ).toBe(300);
    expect(
      resolveEffectiveSellingPricePence(packProduct, { conversionToBase: 1, sellingPricePence: 550 })
    ).toBe(550);
    expect(
      resolveEffectiveSellingPricePence(packProduct, { conversionToBase: 1, sellingPricePence: 1000 })
    ).toBe(1000);
  });

  it('prorates base-value calculations from explicit unit prices for promo math', () => {
    const cartonUnit = { conversionToBase: 24, sellingPricePence: 2200 };

    expect(resolveProductUnitBaseValuePence(2200, cartonUnit, 6)).toBe(550);
    expect(resolveProductUnitBaseValuePence(2200, cartonUnit, 1)).toBe(92);
  });
});
