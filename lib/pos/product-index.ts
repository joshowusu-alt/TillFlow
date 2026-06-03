import type { PosBarcodeProduct } from '@/lib/payments/pos-barcode';
import { normalizeBarcodeDigits, parseWeighedBarcode } from '@/lib/payments/pos-weighed-barcode';

export type PosProductIndex<TProduct extends PosBarcodeProduct> = {
  byExactBarcode: Map<string, TProduct>;
  /** Longest-prefix-first for variable-weight scans (barcode stored as prefix). */
  weighedPrefixEntries: Array<{ prefix: string; product: TProduct }>;
};

export function buildPosProductIndex<TProduct extends PosBarcodeProduct>(
  products: TProduct[]
): PosProductIndex<TProduct> {
  const byExactBarcode = new Map<string, TProduct>();
  const prefixCandidates: Array<{ prefix: string; product: TProduct }> = [];

  for (const product of products) {
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
  };
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
