import { describe, expect, it } from 'vitest';

import { buildPosProductIndex, findProductByWeighedScan } from './product-index';

const products = [
  {
    id: 'p1',
    barcode: '200123',
    units: [{ id: 'u1', isBaseUnit: true }],
  },
  {
    id: 'p2',
    barcode: '999',
    units: [{ id: 'u2', isBaseUnit: true }],
  },
];

describe('pos product index', () => {
  it('resolves weighed scans by stored prefix', () => {
    const index = buildPosProductIndex(products);
    const match = findProductByWeighedScan(index, '2001230123456');
    expect(match?.product.id).toBe('p1');
    expect(match?.weightGrams).toBe(1234);
  });
});
