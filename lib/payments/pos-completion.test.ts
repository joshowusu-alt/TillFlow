import { describe, expect, it } from 'vitest';

import {
  applyOptimisticStock,
  buildOfflinePayments,
  buildOptimisticStockDecrements,
  createSaleCompletionSnapshot,
} from './pos-completion';

const products = [
  {
    id: 'prod-1',
    onHandBase: 20,
    units: [
      { id: 'base', conversionToBase: 1 },
      { id: 'pack', conversionToBase: 6 },
    ],
  },
  {
    id: 'prod-2',
    onHandBase: 5,
    units: [{ id: 'base', conversionToBase: 1 }],
  },
];

describe('pos-completion helpers', () => {
  it('captures a cloned completion snapshot for rollback', () => {
    const snapshot = createSaleCompletionSnapshot({
      productOptions: products,
      cart: [{ productId: 'prod-1', unitId: 'base', qtyInUnit: 2 }],
      customerId: 'cust-1',
      cashTendered: '10',
      cardPaid: '0',
      transferPaid: '0',
      momoPaid: '0',
      momoRef: 'abc',
      momoPayerMsisdn: '024',
      momoNetwork: 'MTN',
      momoCollectionId: 'collection-1',
      momoCollectionStatus: 'PENDING',
      momoCollectionError: null,
      momoIdempotencyKey: 'idem-1',
      momoCollectionSignature: 'sig-1',
      paymentStatus: 'PAID',
      paymentMethods: ['CASH'],
      orderDiscountType: 'NONE',
      orderDiscountInput: '',
      discountManagerPin: '',
      discountReasonCode: '',
      discountReason: '',
      qtyDrafts: { a: '1' },
      undoStack: [[{ productId: 'prod-1', unitId: 'base', qtyInUnit: 1 }]],
    });

    expect(snapshot.paymentMethods).toEqual(['CASH']);
    expect(snapshot.undoStack).toHaveLength(1);
    expect(snapshot.momoCollectionId).toBe('collection-1');
  });

  it('computes and applies optimistic stock decrements', () => {
    const decrements = buildOptimisticStockDecrements([
      { productId: 'prod-1', unitId: 'base', qtyInUnit: 2 },
      { productId: 'prod-1', unitId: 'pack', qtyInUnit: 1 },
      { productId: 'prod-2', unitId: 'base', qtyInUnit: 3 },
    ], products);

    expect(decrements.get('prod-1')).toBe(8);
    expect(decrements.get('prod-2')).toBe(3);

    const nextProducts = applyOptimisticStock(products, decrements);
    expect(nextProducts[0].onHandBase).toBe(12);
    expect(nextProducts[1].onHandBase).toBe(2);
  });

  it('builds the offline payment payload from applied amounts', () => {
    expect(buildOfflinePayments({
      cashApplied: 500,
      cardPaidValue: 0,
      transferPaidValue: 250,
      momoPaidValue: 0,
    })).toEqual([
      { method: 'CASH', amountPence: 500 },
      { method: 'TRANSFER', amountPence: 250 },
    ]);
  });
});
