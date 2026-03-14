import type { BarcodeFormat } from './barcode-generator';

export function detectBarcodeFormat(
  barcode: string | null | undefined,
): BarcodeFormat | undefined {
  const normalized = barcode?.trim();
  if (!normalized) {
    return undefined;
  }

  return /^\d{12,13}$/.test(normalized) ? 'ean13' : 'code128';
}