import type { PosProductIndex } from '@/lib/pos/product-index';
import { normalizeBarcodeDigits } from '@/lib/payments/pos-weighed-barcode';

export type PosSearchProduct = {
  id: string;
  name: string;
  barcode: string | null;
  categoryName: string | null;
};

const MAX_SCAN_PREFIX_MATCHES = 8;

export function filterPosProducts<TProduct extends PosSearchProduct>(
  products: TProduct[],
  search: string,
  limit = 10,
  index?: PosProductIndex<TProduct & { barcode: string | null; units: { id: string; isBaseUnit: boolean }[] }>
): TProduct[] {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return [];

  const digits = normalizeBarcodeDigits(search);
  if (digits.length >= 4 && index) {
    const exact = index.byExactBarcode.get(digits) ?? index.byExactBarcode.get(search.trim());
    if (exact) return [exact as TProduct];

    if (digits.length >= 4) {
      const prefixMatches: TProduct[] = [];
      for (const entry of index.weighedPrefixEntries) {
        if (entry.prefix.startsWith(digits) || digits.startsWith(entry.prefix)) {
          prefixMatches.push(entry.product as TProduct);
          if (prefixMatches.length >= MAX_SCAN_PREFIX_MATCHES) break;
        }
      }
      if (prefixMatches.length === 1) return prefixMatches;
      if (prefixMatches.length > 1) return prefixMatches.slice(0, limit);
    }
  }

  if (normalized.length >= 3 && products.length > 200) {
    const matches: TProduct[] = [];
    for (let i = 0; i < products.length && matches.length < limit; i++) {
      const product = products[i];
      if (product.name.toLowerCase().includes(normalized)) {
        matches.push(product);
        continue;
      }
      if (product.barcode && product.barcode.toLowerCase().includes(normalized)) {
        matches.push(product);
        continue;
      }
      if (product.categoryName && product.categoryName.toLowerCase().includes(normalized)) {
        matches.push(product);
      }
    }
    return matches;
  }

  return products
    .filter(
      (product) =>
        product.name.toLowerCase().includes(normalized) ||
        (product.barcode && product.barcode.toLowerCase().includes(normalized)) ||
        (product.categoryName && product.categoryName.toLowerCase().includes(normalized))
    )
    .slice(0, limit);
}
