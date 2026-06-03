/**
 * EAN-13 variable-weight (in-store) barcodes — leading digit 2.
 * Digits 2–6: item code, digits 7–11: weight in grams (common retail layout).
 */

export type ParsedWeighedBarcode = {
  /** Full 13-digit payload used for prefix matching (e.g. "2001234"). */
  prefix: string;
  /** Five-digit item code (digits 2–6). */
  itemCode: string;
  weightGrams: number;
};

export function normalizeBarcodeDigits(code: string): string {
  return code.replace(/\D/g, '');
}

export function parseWeighedBarcode(code: string): ParsedWeighedBarcode | null {
  const digits = normalizeBarcodeDigits(code);
  if (digits.length !== 13 || digits[0] !== '2') return null;

  const itemCode = digits.slice(1, 6);
  const weightField = digits.slice(6, 11);
  const weightGrams = parseInt(weightField, 10);
  if (!Number.isFinite(weightGrams) || weightGrams <= 0) return null;

  return {
    prefix: digits.slice(0, 7),
    itemCode,
    weightGrams,
  };
}

export function isWeighedBarcode(code: string): boolean {
  return parseWeighedBarcode(code) !== null;
}
