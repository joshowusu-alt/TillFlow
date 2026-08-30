/**
 * Minimal POS sellable DTO — checkout/search/scan only.
 * No imageUrl, no cost/management metadata.
 */

export const POS_LOCAL_INDEX_MAX = 2000;
export const POS_OFFLINE_CATALOGUE_MAX = 5000;
export const POS_SEARCH_TAKE_DEFAULT = 12;
export const POS_SEARCH_TAKE_MAX = 25;

export type PosCatalogueMode = 'local' | 'paged';

export type SellableUnitDto = {
  id: string;
  name: string;
  pluralName: string;
  conversionToBase: number;
  isBaseUnit: boolean;
  sellingPricePence: number | null;
};

export type SellableProductDto = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  sellingPriceBasePence: number;
  vatRateBps: number;
  isTaxable: boolean;
  promoBuyQty: number;
  promoGetQty: number;
  categoryName: string | null;
  units: SellableUnitDto[];
  onHandBase: number;
};

/** Prisma select for sellable POS rows. Intentionally omits imageUrl and cost fields. */
export const SELLABLE_PRODUCT_SELECT = {
  id: true,
  name: true,
  sku: true,
  barcode: true,
  sellingPriceBasePence: true,
  vatRateBps: true,
  isTaxable: true,
  promoBuyQty: true,
  promoGetQty: true,
  updatedAt: true,
  category: { select: { name: true } },
  productUnits: {
    select: {
      unitId: true,
      conversionToBase: true,
      isBaseUnit: true,
      sellingPricePence: true,
      unit: { select: { name: true, pluralName: true } },
    },
  },
} as const;

export type SellableProductRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  sellingPriceBasePence: number;
  vatRateBps: number;
  isTaxable: boolean;
  promoBuyQty: number;
  promoGetQty: number;
  category?: { name: string } | null;
  productUnits: Array<{
    unitId: string;
    conversionToBase: number;
    isBaseUnit: boolean;
    sellingPricePence: number | null;
    unit: { name: string; pluralName: string };
  }>;
};

export function toSellableProductDto(
  product: SellableProductRow,
  onHandBase: number
): SellableProductDto {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    sellingPriceBasePence: product.sellingPriceBasePence,
    vatRateBps: product.vatRateBps,
    isTaxable: product.isTaxable,
    promoBuyQty: product.promoBuyQty,
    promoGetQty: product.promoGetQty,
    categoryName: product.category?.name ?? null,
    units: product.productUnits.map((pu) => ({
      id: pu.unitId,
      name: pu.unit.name,
      pluralName: pu.unit.pluralName,
      conversionToBase: pu.conversionToBase,
      isBaseUnit: pu.isBaseUnit,
      sellingPricePence: pu.sellingPricePence,
    })),
    onHandBase,
  };
}

export function resolvePosCatalogueMode(options: {
  productCount: number;
  posCatalogueMode?: string | null;
}): PosCatalogueMode {
  if (options.posCatalogueMode === 'paged') return 'paged';
  if (options.productCount > POS_LOCAL_INDEX_MAX) return 'paged';
  return 'local';
}

export function usesLocalPosCatalogue(
  productCount: number,
  posCatalogueMode?: string | null
): boolean {
  return resolvePosCatalogueMode({ productCount, posCatalogueMode }) === 'local';
}

export function clampPosSearchTake(raw: string | null | undefined): number {
  const n = Number(raw ?? POS_SEARCH_TAKE_DEFAULT);
  if (!Number.isFinite(n) || n <= 0) return POS_SEARCH_TAKE_DEFAULT;
  return Math.min(Math.floor(n), POS_SEARCH_TAKE_MAX);
}

export function capOfflineCatalogue<T>(products: T[], max = POS_OFFLINE_CATALOGUE_MAX): T[] {
  if (products.length <= max) return products;
  return products.slice(0, max);
}

export function jsonByteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}
