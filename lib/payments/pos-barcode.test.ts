import { describe, expect, it } from 'vitest';

import {
  computeWeighedLineSubtotalPence,
  getProductBaseUnitId,
  resolveBarcodeScan,
} from './pos-barcode';
import { buildPosProductIndex } from '@/lib/pos/product-index';

const products = [
  {
    id: 'prod-1',
    barcode: '12345',
    sellingPriceBasePence: 1000,
    units: [
      { id: 'pack', isBaseUnit: false },
      { id: 'piece', isBaseUnit: true },
    ],
  },
  {
    id: 'prod-weigh',
    barcode: '200123',
    sellingPriceBasePence: 2000,
    units: [{ id: 'kg', isBaseUnit: true }],
  },
  {
    id: 'prod-2',
    barcode: '77777',
    sellingPriceBasePence: 500,
    units: [{ id: 'bottle', isBaseUnit: false }],
  },
];

describe('pos-barcode helpers', () => {
  it('finds the base unit id for matched products', () => {
    expect(getProductBaseUnitId(products[0])).toBe('piece');
    expect(getProductBaseUnitId(products[2])).toBe('bottle');
  });

  it('resolves matched and missing barcode scans', () => {
    const index = buildPosProductIndex(products);

    expect(resolveBarcodeScan(' 12345 ', products, index)).toEqual({
      kind: 'matched',
      product: products[0],
      baseUnitId: 'piece',
      qtyInUnit: 1,
    });

    expect(resolveBarcodeScan('missing', products, index)).toEqual({
      kind: 'missing',
      code: 'missing',
    });

    expect(resolveBarcodeScan('   ', products, index)).toBeNull();
  });

  it('resolves weighed variable barcodes', () => {
    const index = buildPosProductIndex(products);
    const result = resolveBarcodeScan('2001230123456', products, index);
    expect(result?.kind).toBe('weighed');
    if (result?.kind === 'weighed') {
      expect(result.product.id).toBe('prod-weigh');
      expect(result.weightGrams).toBe(1234);
      expect(result.lineSubtotalPence).toBe(computeWeighedLineSubtotalPence(1234, 2000));
    }
  });
});
