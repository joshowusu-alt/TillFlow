import { computeDiscount, type PosCheckoutTotals, type PosDiscountType } from './pos-checkout';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import {
  resolveEffectiveSellingPricePence,
  resolveProductUnitBaseValuePence,
} from '@/lib/services/shared';

export type PosUnit = {
  id: string;
  name: string;
  pluralName: string;
  conversionToBase: number;
  isBaseUnit: boolean;
  sellingPricePence?: number | null;
  defaultCostPence?: number | null;
};

export type PosProduct = {
  id: string;
  name: string;
  barcode: string | null;
  sellingPriceBasePence: number;
  vatRateBps: number;
  promoBuyQty: number;
  promoGetQty: number;
  categoryId: string | null;
  categoryName: string | null;
  categoryImageUrl?: string | null;
  publicCategoryId?: string;
  publicCategoryName?: string;
  publicCategoryPriority?: number;
  imageUrl: string | null;
  units: PosUnit[];
  onHandBase: number;
};

export type PosCartLine = {
  id: string;
  productId: string;
  unitId: string;
  qtyInUnit: number;
  discountType?: PosDiscountType;
  discountValue?: string;
  /** Fixed line total for weighed items (qtyInUnit should be 1). */
  lineSubtotalPence?: number;
  /** Stock deduction in base units (grams when inventory is tracked per kg). */
  qtyBase?: number;
  weighedLabel?: string;
};

export type PosCartDetail = PosCartLine & {
  product: PosProduct;
  unit: PosUnit;
  qtyLabel: string;
  unitPrice: number;
  subtotal: number;
  lineDiscount: number;
  promoDiscount: number;
  netSubtotal: number;
  vat: number;
  total: number;
  promoLabel: string | null;
};

export function buildProductMap(products: PosProduct[]) {
  return new Map(products.map((product) => [product.id, product]));
}

export function getUnitFromProduct(product: PosProduct | undefined, unitIdValue: string) {
  return product?.units.find((unit) => unit.id === unitIdValue);
}

export function getAvailableBase(
  cart: PosCartLine[],
  productMap: Map<string, PosProduct>,
  targetProductId: string,
  excludeLineId?: string
) {
  const product = productMap.get(targetProductId);
  if (!product) return 0;
  const usedBase = cart.reduce((sum, line) => {
    if (line.productId !== targetProductId || line.id === excludeLineId) return sum;
    const unit = getUnitFromProduct(product, line.unitId);
    if (!unit) return sum;
    const lineBase =
      typeof line.qtyBase === 'number' && line.qtyBase > 0
        ? line.qtyBase
        : line.qtyInUnit * unit.conversionToBase;
    return sum + lineBase;
  }, 0);

  return Math.max(product.onHandBase - usedBase, 0);
}

export function formatAvailable(product: PosProduct, availableBase: number) {
  const baseUnit = product.units.find((unit) => unit.isBaseUnit);
  const packaging = getPrimaryPackagingUnit(
    product.units.map((unit) => ({ conversionToBase: unit.conversionToBase, unit }))
  );
  return formatMixedUnit({
    qtyBase: availableBase,
    baseUnit: baseUnit?.name ?? 'unit',
    baseUnitPlural: baseUnit?.pluralName,
    packagingUnit: packaging?.unit.name,
    packagingUnitPlural: packaging?.unit.pluralName,
    packagingConversion: packaging?.conversionToBase,
  });
}

export function buildCartDetails(
  cart: PosCartLine[],
  productMap: Map<string, PosProduct>,
  vatEnabled: boolean
): PosCartDetail[] {
  return cart
    .map((line) => {
      const product = productMap.get(line.productId);
      const unit = product ? getUnitFromProduct(product, line.unitId) : undefined;
      if (!product || !unit) return null;

      const qtyBase =
        typeof line.qtyBase === 'number' && line.qtyBase > 0
          ? Math.round(line.qtyBase)
          : line.qtyInUnit * unit.conversionToBase;
      const unitPrice = resolveEffectiveSellingPricePence(product, unit);
      const subtotal =
        typeof line.lineSubtotalPence === 'number' && line.lineSubtotalPence > 0
          ? line.lineSubtotalPence
          : unitPrice * line.qtyInUnit;
      const lineDiscount = computeDiscount(subtotal, line.discountType, line.discountValue);
      const promoBuyQty = product.promoBuyQty ?? 0;
      const promoGetQty = product.promoGetQty ?? 0;
      const promoGroup = promoBuyQty + promoGetQty;
      const promoFreeUnits =
        promoBuyQty > 0 && promoGetQty > 0 && promoGroup > 0
          ? Math.floor(qtyBase / promoGroup) * promoGetQty
          : 0;
      const promoDiscount = Math.min(
        resolveProductUnitBaseValuePence(unitPrice, unit, promoFreeUnits),
        Math.max(subtotal - lineDiscount, 0)
      );
      const netSubtotal = Math.max(subtotal - lineDiscount - promoDiscount, 0);
      const vat = vatEnabled ? Math.round((netSubtotal * product.vatRateBps) / 10000) : 0;
      const total = netSubtotal + vat;
      const baseUnit = product.units.find((candidate) => candidate.isBaseUnit);
      const packaging = getPrimaryPackagingUnit(
        product.units.map((candidate) => ({ conversionToBase: candidate.conversionToBase, unit: candidate }))
      );
      const qtyLabel =
        line.weighedLabel ??
        formatMixedUnit({
          qtyBase,
          baseUnit: baseUnit?.name ?? 'unit',
          baseUnitPlural: baseUnit?.pluralName,
          packagingUnit: packaging?.unit.name,
          packagingUnitPlural: packaging?.unit.pluralName,
          packagingConversion: packaging?.conversionToBase,
        });

      return {
        ...line,
        product,
        unit,
        qtyLabel,
        unitPrice,
        subtotal,
        lineDiscount,
        promoDiscount,
        netSubtotal,
        vat,
        total,
        promoLabel:
          promoFreeUnits > 0
            ? `Promo: ${promoBuyQty} + ${promoGetQty} (free ${promoFreeUnits})`
            : null,
      };
    })
    .filter(Boolean) as PosCartDetail[];
}

export function buildAvailableBaseMap(cart: PosCartLine[], productMap: Map<string, PosProduct>) {
  const usedMap = new Map<string, number>();
  for (const line of cart) {
    const product = productMap.get(line.productId);
    const unit = product ? getUnitFromProduct(product, line.unitId) : undefined;
    if (product && unit) {
      const lineBase =
        typeof line.qtyBase === 'number' && line.qtyBase > 0
          ? line.qtyBase
          : line.qtyInUnit * unit.conversionToBase;
      usedMap.set(line.productId, (usedMap.get(line.productId) ?? 0) + lineBase);
    }
  }

  const result = new Map<string, number>();
  for (const [productId, used] of usedMap) {
    const product = productMap.get(productId);
    result.set(productId, Math.max((product?.onHandBase ?? 0) - used, 0));
  }
  return result;
}

export function sumCartTotals(cartDetails: PosCartDetail[]): PosCheckoutTotals {
  return cartDetails.reduce(
    (acc, line) => {
      acc.subtotal += line.subtotal;
      acc.lineDiscount += line.lineDiscount;
      acc.promoDiscount += line.promoDiscount;
      acc.netSubtotal += line.netSubtotal;
      acc.vat += line.vat;
      return acc;
    },
    { subtotal: 0, lineDiscount: 0, promoDiscount: 0, netSubtotal: 0, vat: 0 }
  );
}
