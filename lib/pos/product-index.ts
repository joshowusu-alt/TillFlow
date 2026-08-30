import type { PosBarcodeProduct } from '@/lib/payments/pos-barcode';
import { normalizeBarcodeDigits, parseWeighedBarcode } from '@/lib/payments/pos-weighed-barcode';

type IndexedSearchFields = {
  name?: string;
  sku?: string | null;
  categoryName?: string | null;
};

export type PosProductIndex<TProduct extends PosBarcodeProduct> = {
  byExactBarcode: Map<string, TProduct>;
  /** Longest-prefix-first for variable-weight scans (barcode stored as prefix). */
  weighedPrefixEntries: Array<{ prefix: string; product: TProduct }>;
  bySku: Map<string, TProduct>;
  searchHaystack: Array<{ hay: string; product: TProduct }>;
};

function searchHayFor(product: PosBarcodeProduct & IndexedSearchFields): string {
  return `${product.name ?? ''} ${product.sku ?? ''} ${product.barcode ?? ''} ${product.categoryName ?? ''}`.toLowerCase();
}

export function buildPosProductIndex<TProduct extends PosBarcodeProduct>(
  products: TProduct[]
): PosProductIndex<TProduct> {
  const byExactBarcode = new Map<string, TProduct>();
  const prefixCandidates: Array<{ prefix: string; product: TProduct }> = [];
  const bySku = new Map<string, TProduct>();
  const searchHaystack: Array<{ hay: string; product: TProduct }> = [];

  for (const product of products) {
    const searchable = product as TProduct & IndexedSearchFields;
    const sku = searchable.sku?.trim();
    if (sku) bySku.set(sku.toLowerCase(), product);
    searchHaystack.push({ hay: searchHayFor(searchable), product });

    const raw = product.barcode?.trim();
    if (!raw) continue;
    const digits = normalizeBarcodeDigits(raw);
    if (!digits) continue;

    byExactBarcode.set(digits, product);
    byExactBarcode.set(raw, product);

    if (digits.startsWith('2') && digits.length >= 4 && digits.length <= 12) {
      prefixCandidates.push({ prefix: digits, product });
    }
  }

  prefixCandidates.sort((a, b) => b.prefix.length - a.prefix.length);

  return {
    byExactBarcode,
    weighedPrefixEntries: prefixCandidates,
    bySku,
    searchHaystack,
  };
}

export function searchPosProductIndex<TProduct extends PosBarcodeProduct>(
  index: PosProductIndex<TProduct>,
  query: string,
  limit = 12
): TProduct[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const skuHit = index.bySku.get(normalized);
  if (skuHit) return [skuHit];

  const exact = findProductByExactBarcode(index, query);
  if (exact) return [exact];

  const matches: TProduct[] = [];
  for (let i = 0; i < index.searchHaystack.length && matches.length < limit; i++) {
    const row = index.searchHaystack[i]!;
    if (row.hay.includes(normalized)) matches.push(row.product);
  }
  return matches;
}

export function findProductByWeighedScan<TProduct extends PosBarcodeProduct>(
  index: PosProductIndex<TProduct>,
  code: string
): { product: TProduct; weightGrams: number } | null {
  const parsed = parseWeighedBarcode(code);
  if (!parsed) return null;

  const digits = normalizeBarcodeDigits(code);

  for (const entry of index.weighedPrefixEntries) {
    if (digits.startsWith(entry.prefix) || parsed.prefix.startsWith(entry.prefix)) {
      return { product: entry.product, weightGrams: parsed.weightGrams };
    }
  }

  for (const entry of index.weighedPrefixEntries) {
    if (entry.prefix.startsWith(parsed.itemCode) || parsed.itemCode === entry.prefix.slice(1)) {
      return { product: entry.product, weightGrams: parsed.weightGrams };
    }
  }

  return null;
}

export function findProductByExactBarcode<TProduct extends PosBarcodeProduct>(
  index: PosProductIndex<TProduct>,
  code: string
): TProduct | null {
  const trimmed = code.trim();
  if (!trimmed) return null;
  return index.byExactBarcode.get(trimmed) ?? index.byExactBarcode.get(normalizeBarcodeDigits(trimmed)) ?? null;
}
