import { describe, expect, it } from 'vitest';

import {
  generateBarcodeDataUrl,
  generateBarcodePng,
  validateBarcodeValue,
} from './barcode-generator';

function expectPngBuffer(buffer: Buffer) {
  expect(buffer.length).toBeGreaterThan(8);
  expect(Array.from(buffer.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
}

describe('generateBarcodePng', () => {
  it('generates an EAN-13 PNG buffer', async () => {
    const buffer = await generateBarcodePng({
      value: '5901234123457',
      format: 'ean13',
    });

    expectPngBuffer(buffer);
  });

  it('generates a Code 128 PNG buffer', async () => {
    const buffer = await generateBarcodePng({
      value: 'SKU-12345',
      format: 'code128',
    });

    expectPngBuffer(buffer);
  });

  it('generates a QR code PNG buffer', async () => {
    const buffer = await generateBarcodePng({
      value: 'https://tillflow.test/products/sku-12345',
      format: 'qrcode',
    });

    expectPngBuffer(buffer);
  });

  it('throws a descriptive error for empty values', async () => {
    await expect(
      generateBarcodePng({
        value: '   ',
        format: 'code128',
      }),
    ).rejects.toThrow('Invalid CODE128 barcode value: Barcode value cannot be empty.');
  });
});

describe('generateBarcodeDataUrl', () => {
  it('returns a PNG data URL', async () => {
    const dataUrl = await generateBarcodeDataUrl({
      value: '590123412345',
      format: 'ean13',
    });

    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});

describe('validateBarcodeValue', () => {
  it('validates EAN-13 values', () => {
    expect(validateBarcodeValue('5901234123457', 'ean13')).toEqual({ valid: true });
    expect(validateBarcodeValue('590123412345', 'ean13')).toEqual({ valid: true });
    expect(validateBarcodeValue('59012341234AB', 'ean13')).toEqual({
      valid: false,
      error: 'EAN-13 values must contain digits only.',
    });
    expect(validateBarcodeValue('59012341234', 'ean13')).toEqual({
      valid: false,
      error: 'EAN-13 values must be 12 digits (auto check digit) or 13 digits.',
    });
  });

  it('validates Code 128 values as ASCII', () => {
    expect(validateBarcodeValue('TillFlow-123_ABC', 'code128')).toEqual({ valid: true });
    expect(validateBarcodeValue('TillFlow™', 'code128')).toEqual({
      valid: false,
      error: 'Code 128 values must contain ASCII characters only.',
    });
  });

  it('rejects empty values for all formats', () => {
    expect(validateBarcodeValue('', 'qrcode')).toEqual({
      valid: false,
      error: 'Barcode value cannot be empty.',
    });
  });
});
