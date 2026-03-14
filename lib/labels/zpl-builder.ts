import { LabelData, LabelSize, LABEL_DIMENSIONS } from './types';
import { validateBarcodeValue } from './barcode-generator';

const DOTS_PER_MM = 8;

function sanitizeZplText(value: string | undefined): string {
  return (value ?? '').replace(/[\^~]/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeZplBarcode(value: string): string {
  return value.trim().replace(/[\^~]/g, ' ').replace(/\r?\n/g, '');
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function calculateEan13CheckDigit(value: string): string {
  const checksum = value
    .slice(0, 12)
    .split('')
    .reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);

  return String((10 - (checksum % 10)) % 10);
}

function normalizeZplBarcodeValue(value: string, format: NonNullable<LabelData['barcodeFormat']>): string {
  if (format === 'ean13' && value.length === 12) {
    return `${value}${calculateEan13CheckDigit(value)}`;
  }

  return value;
}

function buildBarcodeSection(
  barcode: string,
  format: NonNullable<LabelData['barcodeFormat']>,
  x: number,
  y: number,
): string {
  switch (format) {
    case 'ean13':
      return `^BY2,2,60^FO${x},${y}^BEN,60,Y,N^FD${barcode}^FS`;
    case 'qrcode':
      return `^FO${x},${y}^BQN,2,6^FDLA,${barcode}^FS`;
    case 'code128':
    default:
      return `^BY2,2,60^FO${x},${y}^BCN,60,Y,N,N^FD${barcode}^FS`;
  }
}

/**
 * Build ZPL (Zebra Programming Language) commands for a product label.
 * Used for direct printing to Zebra thermal label printers via QZ Tray.
 */
export function buildZplLabel(data: LabelData, size: LabelSize): string {
  const dims = LABEL_DIMENSIONS[size];
  const widthDots = dims.widthMm * DOTS_PER_MM;
  const heightDots = dims.heightMm * DOTS_PER_MM;
  const margin = 16;
  const contentWidth = Math.max(widthDots - margin * 2, 0);
  const nameMaxLength = size === 'A4_SHEET' ? 60 : 28;
  const productName = truncateText(sanitizeZplText(data.productName), nameMaxLength);
  const price = sanitizeZplText(data.price);
  const unit = sanitizeZplText(data.unit);
  const labelLines = [
    '^XA',
    `^PW${widthDots}`,
    `^LL${heightDots}`,
    '^CI28',
    `^FO${margin},${margin}^A0N,28,28^FB${contentWidth},2,4,L,0^FD${productName}^FS`,
  ];

  let nextY = 72;

  if (data.barcode) {
    const format = data.barcodeFormat ?? 'code128';
    const barcodeValue = sanitizeZplBarcode(data.barcode);
    const validation = validateBarcodeValue(barcodeValue, format);

    if (!validation.valid) {
      throw new Error(`Invalid ${format.toUpperCase()} barcode for ZPL label: ${validation.error}`);
    }

    labelLines.push(
      buildBarcodeSection(normalizeZplBarcodeValue(barcodeValue, format), format, margin, nextY),
    );
    nextY += format === 'qrcode' ? 110 : 100;
  }

  const priceY = Math.min(nextY, heightDots - (unit ? 48 : 24));
  labelLines.push(`^FO${margin},${priceY}^A0N,32,32^FD${price}^FS`);

  if (unit) {
    labelLines.push(`^FO${margin},${Math.min(priceY + 28, heightDots - 16)}^A0N,20,20^FD${unit}^FS`);
  }

  labelLines.push('^XZ');

  return labelLines.join('\n');
}

/**
 * Build ZPL for multiple labels (batch printing).
 */
export function buildZplBatch(items: Array<{ data: LabelData; quantity: number }>, size: LabelSize): string {
  return items
    .flatMap(({ data, quantity }) =>
      Array.from({ length: Math.max(0, Math.floor(quantity)) }, () => buildZplLabel(data, size)),
    )
    .join('\n');
}
