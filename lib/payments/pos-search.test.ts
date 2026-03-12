import { describe, expect, it } from 'vitest';

import { filterPosProducts } from './pos-search';

const products = [
  { id: '1', name: 'Indomie Chicken', barcode: '12345', categoryName: 'Noodles' },
  { id: '2', name: 'Coca Cola', barcode: '99887', categoryName: 'Beverages' },
  { id: '3', name: 'Peak Milk', barcode: null, categoryName: 'Dairy' },
];

describe('filterPosProducts', () => {
  it('returns empty results for blank search', () => {
    expect(filterPosProducts(products, '')).toEqual([]);
    expect(filterPosProducts(products, '   ')).toEqual([]);
  });

  it('matches by product name, barcode, or category', () => {
    expect(filterPosProducts(products, 'indo')).toEqual([products[0]]);
    expect(filterPosProducts(products, '998')).toEqual([products[1]]);
    expect(filterPosProducts(products, 'dairy')).toEqual([products[2]]);
  });
});
