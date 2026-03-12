import { describe, expect, it } from 'vitest';

import { getProductBaseUnitId, resolveBarcodeScan } from './pos-barcode';

const products = [
  {
    id: 'prod-1',
    barcode: '12345',
    units: [
      { id: 'pack', isBaseUnit: false },
      { id: 'piece', isBaseUnit: true },
    ],
  },
  {
    id: 'prod-2',
    barcode: '77777',
    units: [{ id: 'bottle', isBaseUnit: false }],
  },
];

describe('pos-barcode helpers', () => {
  it('finds the base unit id for matched products', () => {
    expect(getProductBaseUnitId(products[0])).toBe('piece');
    expect(getProductBaseUnitId(products[1])).toBe('bottle');
  });

  it('resolves matched and missing barcode scans', () => {
    expect(resolveBarcodeScan(' 12345 ', products)).toEqual({
      kind: 'matched',
      product: products[0],
      baseUnitId: 'piece',
    });

    expect(resolveBarcodeScan('missing', products)).toEqual({
      kind: 'missing',
      code: 'missing',
    });

    expect(resolveBarcodeScan('   ', products)).toBeNull();
  });
});
