export type ProductUnitSellingPriceProduct = {
  sellingPriceBasePence: number;
};

export type ProductUnitDefaultCostProduct = {
  defaultCostBasePence: number;
};

export type ProductUnitPricingProduct = ProductUnitSellingPriceProduct & ProductUnitDefaultCostProduct;

export type ProductUnitPricingUnit = {
  conversionToBase: number;
  sellingPricePence?: number | null;
  defaultCostPence?: number | null;
};

export function resolveEffectiveSellingPricePence(
  product: ProductUnitSellingPriceProduct,
  unit: ProductUnitPricingUnit
): number {
  return unit.sellingPricePence ?? product.sellingPriceBasePence * unit.conversionToBase;
}

export function resolveEffectiveDefaultCostPence(
  product: ProductUnitDefaultCostProduct,
  unit: ProductUnitPricingUnit
): number {
  return unit.defaultCostPence ?? product.defaultCostBasePence * unit.conversionToBase;
}

export function resolveProductUnitBaseValuePence(
  totalUnitPence: number,
  unit: Pick<ProductUnitPricingUnit, 'conversionToBase'>,
  qtyBase = 1
): number {
  if (qtyBase <= 0) {
    return 0;
  }

  if (unit.conversionToBase <= 1) {
    return totalUnitPence * qtyBase;
  }

  return Math.round((totalUnitPence * qtyBase) / unit.conversionToBase);
}
