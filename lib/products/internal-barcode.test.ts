import { describe, expect, it } from 'vitest';
import {
  barcodeConflictsWithWeighedPrefix,
  businessBarcodeFragment,
  formatInternalBarcode,
  isInternalBarcode,
  INTERNAL_BARCODE_PREFIX,
} from '@/lib/products/internal-barcode';
import { resolveBarcodeScan } from '@/lib/payments/pos-barcode';
import { buildPosProductIndex } from '@/lib/pos/product-index';
import { isWeighedBarcode, parseWeighedBarcode } from '@/lib/payments/pos-weighed-barcode';
import { detectBarcodeFormat } from '@/lib/labels/detect-barcode-format';

describe('internal barcode helpers', () => {
  it('formats TF{biz6}{seq6} codes that never start with 2', () => {
    const code = formatInternalBarcode('clxyz123abc', 42);
    expect(code).toMatch(/^TF[A-Z0-9]{6}\d{6}$/);
    expect(code.startsWith(INTERNAL_BARCODE_PREFIX)).toBe(true);
    expect(code[0]).not.toBe('2');
    expect(isInternalBarcode(code)).toBe(true);
  });

  it('remaps business fragments that would start with 2', () => {
    expect(businessBarcodeFragment('2abcdef')).toMatch(/^T/);
    expect(businessBarcodeFragment('2abcdef')[0]).not.toBe('2');
  });

  it('detects internal vs manufacturer-looking codes', () => {
    expect(isInternalBarcode('TFABCDEX000001')).toBe(true);
    expect(isInternalBarcode('5012345678900')).toBe(false);
    expect(isInternalBarcode('2001234567890')).toBe(false);
  });

  it('flags leading-2 digit codes as weighed-prefix conflicts', () => {
    expect(barcodeConflictsWithWeighedPrefix('2001234567890')).toBe(true);
    expect(barcodeConflictsWithWeighedPrefix('TFABCDEX000001')).toBe(false);
  });

  it('uses Code 128 detection for internal TF codes', () => {
    expect(detectBarcodeFormat('TFABCDEX000001')).toBe('code128');
  });
});

describe('internal barcodes vs POS scanning', () => {
  const products = [
    {
      id: 'p1',
      barcode: 'TFABCDEX000042',
      sellingPriceBasePence: 500,
      units: [{ id: 'u1', isBaseUnit: true }],
    },
    {
      id: 'p2',
      barcode: '5012345678900',
      sellingPriceBasePence: 200,
      units: [{ id: 'u2', isBaseUnit: true }],
    },
    {
      id: 'p3',
      barcode: '20012',
      sellingPriceBasePence: 1500,
      units: [{ id: 'u3', isBaseUnit: true }],
    },
  ];

  it('resolves generated internal barcodes via exact match', () => {
    const index = buildPosProductIndex(products);
    const result = resolveBarcodeScan('TFABCDEX000042', products, index);
    expect(result?.kind).toBe('matched');
    if (result?.kind === 'matched') {
      expect(result.product.id).toBe('p1');
    }
  });

  it('does not treat internal TF barcodes as weighed scans', () => {
    expect(isWeighedBarcode('TFABCDEX000042')).toBe(false);
    expect(parseWeighedBarcode('TFABCDEX000042')).toBeNull();
    const index = buildPosProductIndex(products);
    const result = resolveBarcodeScan('TFABCDEX000042', products, index);
    expect(result?.kind).not.toBe('weighed');
  });

  it('still resolves manufacturer barcodes', () => {
    const index = buildPosProductIndex(products);
    const result = resolveBarcodeScan('5012345678900', products, index);
    expect(result?.kind).toBe('matched');
    if (result?.kind === 'matched') {
      expect(result.product.id).toBe('p2');
    }
  });

  it('still supports weighed barcode prefix products', () => {
    const index = buildPosProductIndex(products);
    // 13-digit weighed: leading 2, item digits, weight grams
    const weighed = '2001200123456';
    expect(isWeighedBarcode(weighed)).toBe(true);
    const result = resolveBarcodeScan(weighed, products, index);
    expect(result?.kind).toBe('weighed');
  });
});
