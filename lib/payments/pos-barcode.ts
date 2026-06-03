import {
  findProductByExactBarcode,
  findProductByWeighedScan,
  type PosProductIndex,
} from '@/lib/pos/product-index';
import { normalizeBarcodeDigits } from '@/lib/payments/pos-weighed-barcode';

export type PosBarcodeUnit = {
  id: string;
  isBaseUnit: boolean;
};

export type PosBarcodeProduct = {
  id: string;
  barcode: string | null;
  sellingPriceBasePence?: number;
  units: PosBarcodeUnit[];
};

export type BarcodeScanResolution<TProduct extends PosBarcodeProduct> =
  | { kind: 'matched'; product: TProduct; baseUnitId: string; qtyInUnit?: number }
  | {
      kind: 'weighed';
      product: TProduct;
      baseUnitId: string;
      weightGrams: number;
      lineSubtotalPence: number;
      qtyBase: number;
    }
  | { kind: 'missing'; code: string };

export function getProductBaseUnitId<TProduct extends PosBarcodeProduct>(product: TProduct): string {
  return product.units.find((unit) => unit.isBaseUnit)?.id ?? product.units[0]?.id ?? '';
}

export function computeWeighedLineSubtotalPence(
  weightGrams: number,
  sellingPriceBasePence: number
): number {
  if (weightGrams <= 0 || sellingPriceBasePence <= 0) return 0;
  return Math.round((weightGrams * sellingPriceBasePence) / 1000);
}

export function resolveBarcodeScan<TProduct extends PosBarcodeProduct>(
  code: string,
  products: TProduct[],
  index?: PosProductIndex<TProduct>
): BarcodeScanResolution<TProduct> | null {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const lookupIndex = index ?? null;
  const digits = normalizeBarcodeDigits(trimmed);

  if (lookupIndex) {
    const exact = findProductByExactBarcode(lookupIndex, trimmed);
    if (exact) {
      return {
        kind: 'matched',
        product: exact,
        baseUnitId: getProductBaseUnitId(exact),
        qtyInUnit: 1,
      };
    }

    const weighed = findProductByWeighedScan(lookupIndex, trimmed);
    if (weighed) {
      const baseUnitId = getProductBaseUnitId(weighed.product);
      const priceBase = weighed.product.sellingPriceBasePence ?? 0;
      return {
        kind: 'weighed',
        product: weighed.product,
        baseUnitId,
        weightGrams: weighed.weightGrams,
        qtyBase: weighed.weightGrams,
        lineSubtotalPence: computeWeighedLineSubtotalPence(weighed.weightGrams, priceBase),
      };
    }
  } else {
    const product = products.find(
      (candidate) =>
        candidate.barcode === trimmed ||
        (candidate.barcode && normalizeBarcodeDigits(candidate.barcode) === digits)
    );
    if (product) {
      return {
        kind: 'matched',
        product,
        baseUnitId: getProductBaseUnitId(product),
        qtyInUnit: 1,
      };
    }

    if (digits.length === 13 && digits[0] === '2') {
      const weighed = findProductByWeighedScan(
        {
          byExactBarcode: new Map(),
          weighedPrefixEntries: products
            .filter((p) => p.barcode?.trim())
            .map((p) => ({ prefix: normalizeBarcodeDigits(p.barcode!), product: p }))
            .filter((e) => e.prefix.startsWith('2'))
            .sort((a, b) => b.prefix.length - a.prefix.length),
        },
        trimmed
      );
      if (weighed) {
        const baseUnitId = getProductBaseUnitId(weighed.product);
        const priceBase = weighed.product.sellingPriceBasePence ?? 0;
        return {
          kind: 'weighed',
          product: weighed.product,
          baseUnitId,
          weightGrams: weighed.weightGrams,
          qtyBase: weighed.weightGrams,
          lineSubtotalPence: computeWeighedLineSubtotalPence(weighed.weightGrams, priceBase),
        };
      }
    }
  }

  return { kind: 'missing', code: trimmed };
}
