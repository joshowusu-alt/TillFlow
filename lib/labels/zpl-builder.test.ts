import { describe, expect, it } from 'vitest';

import { buildZplBatch, buildZplLabel } from './zpl-builder';

describe('buildZplLabel', () => {
  it('includes start and end markers for a single label', () => {
    const zpl = buildZplLabel(
      {
        productName: 'Bananas',
        price: 'GHS 12.50',
      },
      'SHELF_TAG',
    );

    expect(zpl).toContain('^XA');
    expect(zpl).toContain('^XZ');
  });

  it('includes the product name in a field data command', () => {
    const zpl = buildZplLabel(
      {
        productName: 'Bananas',
        price: 'GHS 12.50',
      },
      'SHELF_TAG',
    );

    expect(zpl).toContain('^FDBananas^FS');
  });

  it('includes a barcode command when a barcode is provided', () => {
    const zpl = buildZplLabel(
      {
        productName: 'Bananas',
        price: 'GHS 12.50',
        barcode: '123456789012',
        barcodeFormat: 'ean13',
      },
      'PRODUCT_STICKER',
    );

    expect(zpl).toContain('^BE');
    expect(zpl).toContain('^FD1234567890128^FS');
  });

  it('includes the price', () => {
    const zpl = buildZplLabel(
      {
        productName: 'Bananas',
        price: 'GHS 12.50',
        unit: 'per bunch',
      },
      'SHELF_TAG',
    );

    expect(zpl).toContain('^FDGHS 12.50^FS');
  });

  it('skips barcode commands when no barcode is provided', () => {
    const zpl = buildZplLabel(
      {
        productName: 'Bananas',
        price: 'GHS 12.50',
      },
      'SHELF_TAG',
    );

    expect(zpl).not.toContain('^BC');
    expect(zpl).not.toContain('^BE');
    expect(zpl).not.toContain('^BQ');
  });
});

describe('buildZplBatch', () => {
  it('renders the requested number of labels', () => {
    const batch = buildZplBatch(
      [
        {
          data: {
            productName: 'Bananas',
            price: 'GHS 12.50',
          },
          quantity: 2,
        },
        {
          data: {
            productName: 'Apples',
            price: 'GHS 8.00',
            barcode: 'APPLE-001',
            barcodeFormat: 'code128',
          },
          quantity: 1,
        },
      ],
      'SHELF_TAG',
    );

    expect(batch.match(/\^XA/g)).toHaveLength(3);
    expect(batch.match(/\^XZ/g)).toHaveLength(3);
  });
});
