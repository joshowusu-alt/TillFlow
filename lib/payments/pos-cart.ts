import { computeDiscount, type PosCheckoutTotals, type PosDiscountType } from './pos-checkout';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';

export type PosUnit = {
  id: string;
  name: string;
  pluralName: string;
  conversionToBase: number;
  isBaseUnit: boolean;
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
    return sum + line.qtyInUnit * unit.conversionToBase;
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

      const qtyBase = line.qtyInUnit * unit.conversionToBase;
      const unitPrice = unit.conversionToBase * product.sellingPriceBasePence;
      const subtotal = unitPrice * line.qtyInUnit;
      const lineDiscount = computeDiscount(subtotal, line.discountType, line.discountValue);
      const promoBuyQty = product.promoBuyQty ?? 0;
      const promoGetQty = product.promoGetQty ?? 0;
      const promoGroup = promoBuyQty + promoGetQty;
      const promoFreeUnits =
        promoBuyQty > 0 && promoGetQty > 0 && promoGroup > 0
          ? Math.floor(qtyBase / promoGroup) * promoGetQty
          : 0;
      const promoDiscount = Math.min(
        promoFreeUnits * product.sellingPriceBasePence,
        Math.max(subtotal - lineDiscount, 0)
      );
      const netSubtotal = Math.max(subtotal - lineDiscount - promoDiscount, 0);
      const vat = vatEnabled ? Math.round((netSubtotal * product.vatRateBps) / 10000) : 0;
      const total = netSubtotal + vat;
      const baseUnit = product.units.find((candidate) => candidate.isBaseUnit);
      const packaging = getPrimaryPackagingUnit(
        product.units.map((candidate) => ({ conversionToBase: candidate.conversionToBase, unit: candidate }))
      );
      const qtyLabel = formatMixedUnit({
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
      usedMap.set(line.productId, (usedMap.get(line.productId) ?? 0) + line.qtyInUnit * unit.conversionToBase);
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