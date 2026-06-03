export type ProductPriceWarning = {
  code: 'below_cost' | 'high_vs_cost' | 'price_matches_qty' | 'unusually_low';
  message: string;
};

export function getProductPriceWarnings(input: {
  sellingPricePence: number;
  defaultCostBasePence: number;
  openingStockQty?: number;
}): ProductPriceWarning[] {
  const warnings: ProductPriceWarning[] = [];
  const sell = Math.round(input.sellingPricePence);
  const cost = Math.round(input.defaultCostBasePence);
  const openingStockQty = Math.max(0, Math.round(input.openingStockQty ?? 0));

  if (sell <= 0) return warnings;

  if (cost > 0 && sell < cost) {
    warnings.push({
      code: 'below_cost',
      message: 'Selling price is lower than cost. Please check this price before saving.',
    });
  }

  if (cost > 0 && sell > cost * 25) {
    warnings.push({
      code: 'high_vs_cost',
      message: 'Selling price is much higher than cost. Please check this price before saving.',
    });
  }

  if (cost > 0 && sell < Math.max(50, Math.round(cost * 0.15))) {
    warnings.push({
      code: 'unusually_low',
      message: 'Selling price looks unusually low. Please check this price before saving.',
    });
  }

  const sellMajor = sell / 100;
  if (
    openingStockQty > 0 &&
    Number.isInteger(sellMajor) &&
    sellMajor === openingStockQty &&
    openingStockQty >= 2 &&
    openingStockQty <= 999
  ) {
    warnings.push({
      code: 'price_matches_qty',
      message: 'Selling price matches opening stock quantity — please check this price before saving.',
    });
  }

  return warnings;
}

export function formatProductPriceWarnings(warnings: ProductPriceWarning[]): string {
  return warnings.map((w) => w.message).join(' ');
}
