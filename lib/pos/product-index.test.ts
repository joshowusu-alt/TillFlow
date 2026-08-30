import { describe, expect, it } from 'vitest';

import { filterPosProducts } from '@/lib/payments/pos-search';

import {
  buildPosProductIndex,
  findProductByExactBarcode,
  findProductByWeighedScan,
  searchPosProductIndex,
} from './product-index';

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

function syntheticCatalogue(size: number) {
  return Array.from({ length: size }, (_, i) => ({
    id: `p${i}`,
    name: i === 500 ? 'Coca Cola 330ml' : `Scale SKU ${String(i).padStart(4, '0')}`,
    sku: `SKU-${String(i).padStart(6, '0')}`,
    barcode: `${1000000000000 + i}`,
    categoryName: i % 7 === 0 ? 'Beverages' : 'Grocery',
    sellingPriceBasePence: 100 + i,
    units: [{ id: `u${i}`, isBaseUnit: true }],
  }));
}

describe('pos product index', () => {
  it('resolves weighed scans by stored prefix', () => {
    const index = buildPosProductIndex(products);
    const match = findProductByWeighedScan(index, '2001230123456');
    expect(match?.product.id).toBe('p1');
    expect(match?.weightGrams).toBe(1234);
  });

  it('builds a 1000-product index and finds by barcode, sku, and name', () => {
    const catalogue = syntheticCatalogue(1000);
    const index = buildPosProductIndex(catalogue);

    expect(index.searchHaystack).toHaveLength(1000);
    expect(findProductByExactBarcode(index, catalogue[777]!.barcode)?.id).toBe('p777');
    expect(searchPosProductIndex(index, 'SKU-000500', 8).map((p) => p.id)).toEqual(['p500']);
    expect(searchPosProductIndex(index, 'coca cola', 8).map((p) => p.id)).toEqual(['p500']);
    expect(filterPosProducts(catalogue, 'coca', 8, index).map((p) => p.id)).toEqual(['p500']);
  });
});
