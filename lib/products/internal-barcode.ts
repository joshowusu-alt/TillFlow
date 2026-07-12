/**
 * Internal TillFlow barcode helpers.
 *
 * Generated codes are business-only identifiers — not manufacturer/GS1 barcodes.
 * Format: TF{biz6}{seq6}  (Code 128 ASCII, never starts with "2")
 */

export const INTERNAL_BARCODE_PREFIX = 'TF';
export const INTERNAL_BARCODE_SEQUENCE_NAME = 'internal_barcode';

/** Human-facing copy shown near generate / print UI. */
export const INTERNAL_BARCODE_LABEL = 'Internal barcode';
export const INTERNAL_BARCODE_HELP = 'For use inside this business only.';

export function isInternalBarcode(code: string | null | undefined): boolean {
  const trimmed = code?.trim() ?? '';
  return /^TF[A-Z0-9]{6}\d{6}$/i.test(trimmed);
}

/**
 * Compact business fragment for barcode namespace (6 alphanumeric chars).
 * Avoids starting with "2" so POS weighed-barcode parsing (prefix 2) never applies.
 */
export function businessBarcodeFragment(businessId: string): string {
  const cleaned = businessId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const base = (cleaned || 'BIZXXX').slice(0, 6).padEnd(6, 'X');
  // Guard: if somehow starts with digit 2, remap to T
  return base[0] === '2' ? `T${base.slice(1)}` : base;
}

export function formatInternalBarcode(businessId: string, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('Internal barcode sequence must be a positive integer.');
  }
  const fragment = businessBarcodeFragment(businessId);
  const seq = String(sequence).padStart(6, '0').slice(-6);
  return `${INTERNAL_BARCODE_PREFIX}${fragment}${seq}`;
}

/** True if a scanned/generated code could be confused with weighed EAN-13 (leading 2). */
export function barcodeConflictsWithWeighedPrefix(code: string): boolean {
  const digits = code.replace(/\D/g, '');
  return digits.length >= 1 && digits[0] === '2' && !code.trim().toUpperCase().startsWith('TF');
}
