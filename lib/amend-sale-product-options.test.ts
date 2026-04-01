import { describe, expect, it } from 'vitest';

import { filterAmendSaleProductOptions, type AmendSaleProductOption } from './amend-sale-product-options';

const PRODUCTS: AmendSaleProductOption[] = [
  {
    id: 'out-oscar',
    name: 'OUT/OSCAR',
    barcode: '12345',
    categoryName: 'Matches',
  },
  {
    id: 'holy-matches',
    name: 'HOLY MATCHES',
    barcode: '67890',
    categoryName: 'Matches',
  },
  {
    id: 'tiger-battery',
    name: 'TIGER BATTERY',
    barcode: null,
    categoryName: 'Batteries',
  },
];

describe('filterAmendSaleProductOptions', () => {
  it('keeps products hidden while they remain on the amended invoice', () => {
    const result = filterAmendSaleProductOptions(PRODUCTS, {
      keptProductIds: new Set(['out-oscar']),
      addedProductIds: new Set(),
      searchQuery: 'out/oscar',
    });

    expect(result).toEqual([]);
  });

  it('shows a removed invoice product again so it can be re-added', () => {
    const result = filterAmendSaleProductOptions(PRODUCTS, {
      keptProductIds: new Set(['holy-matches']),
      addedProductIds: new Set(),
      searchQuery: 'out/oscar',
    });

    expect(result.map((product) => product.id)).toEqual(['out-oscar']);
  });

  it('hides products already staged as new amendment items', () => {
    const result = filterAmendSaleProductOptions(PRODUCTS, {
      keptProductIds: new Set(),
      addedProductIds: new Set(['out-oscar']),
      searchQuery: 'out/oscar',
    });

    expect(result).toEqual([]);
  });

  it('matches barcode and category search text', () => {
    const barcodeMatch = filterAmendSaleProductOptions(PRODUCTS, {
      keptProductIds: new Set(),
      addedProductIds: new Set(),
      searchQuery: '67890',
    });
    const categoryMatch = filterAmendSaleProductOptions(PRODUCTS, {
      keptProductIds: new Set(),
      addedProductIds: new Set(),
      searchQuery: 'batteries',
    });

    expect(barcodeMatch.map((product) => product.id)).toEqual(['holy-matches']);
    expect(categoryMatch.map((product) => product.id)).toEqual(['tiger-battery']);
  });
});