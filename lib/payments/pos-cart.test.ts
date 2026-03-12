import { describe, expect, it } from 'vitest';

import {
  buildAvailableBaseMap,
  buildCartDetails,
  buildProductMap,
  formatAvailable,
  getAvailableBase,
  sumCartTotals,
  type PosCartLine,
  type PosProduct,
} from './pos-cart';

const products: PosProduct[] = [
  {
    id: 'prod-1',
    name: 'Indomie',
    barcode: '123',
    sellingPriceBasePence: 100,
    vatRateBps: 1500,
    promoBuyQty: 5,
    promoGetQty: 1,
    categoryId: null,
    categoryName: 'Snacks',
    imageUrl: null,
    onHandBase: 24,
    units: [
      { id: 'pack', name: 'pack', pluralName: 'packs', conversionToBase: 1, isBaseUnit: true },
      { id: 'carton', name: 'carton', pluralName: 'cartons', conversionToBase: 12, isBaseUnit: false },
    ],
  },
  {
    id: 'prod-2',
    name: 'Water',
    barcode: '456',
    sellingPriceBasePence: 250,
    vatRateBps: 0,
    promoBuyQty: 0,
    promoGetQty: 0,
    categoryId: null,
    categoryName: 'Beverages',
    imageUrl: null,
    onHandBase: 10,
    units: [
      { id: 'bottle', name: 'bottle', pluralName: 'bottles', conversionToBase: 1, isBaseUnit: true },
    ],
  },
];

const cart: PosCartLine[] = [
  {
    id: 'prod-1:pack',
    productId: 'prod-1',
    unitId: 'pack',
    qtyInUnit: 6,
    discountType: 'NONE',
    discountValue: '',
  },
  {
    id: 'prod-2:bottle',
    productId: 'prod-2',
    unitId: 'bottle',
    qtyInUnit: 2,
    discountType: 'AMOUNT',
    discountValue: '1.00',
  },
];

describe('pos-cart helpers', () => {
  it('builds cart details with promo and VAT math', () => {
    const productMap = buildProductMap(products);
    const details = buildCartDetails(cart, productMap, true);

    expect(details).toHaveLength(2);
    expect(details[0].promoDiscount).toBe(100);
    expect(details[0].promoLabel).toBe('Promo: 5 + 1 (free 1)');
    expect(details[0].vat).toBe(75);
    expect(details[1].lineDiscount).toBe(100);
    expect(details[1].total).toBe(400);
  });

  it('sums cart totals from enriched lines', () => {
    const productMap = buildProductMap(products);
    const details = buildCartDetails(cart, productMap, true);
    const totals = sumCartTotals(details);

    expect(totals.subtotal).toBe(1100);
    expect(totals.lineDiscount).toBe(100);
    expect(totals.promoDiscount).toBe(100);
    expect(totals.netSubtotal).toBe(900);
    expect(totals.vat).toBe(75);
  });

  it('computes available stock with and without excluding a line', () => {
    const productMap = buildProductMap(products);
    const availableBaseMap = buildAvailableBaseMap(cart, productMap);

    expect(availableBaseMap.get('prod-1')).toBe(18);
    expect(getAvailableBase(cart, productMap, 'prod-1')).toBe(18);
    expect(getAvailableBase(cart, productMap, 'prod-1', 'prod-1:pack')).toBe(24);
  });

  it('formats available quantities using packaging units', () => {
    expect(formatAvailable(products[0], 18)).toBe('1 carton + 6 packs');
    expect(formatAvailable(products[1], 2)).toBe('2 bottles');
  });
});
