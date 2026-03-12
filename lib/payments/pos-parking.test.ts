import { describe, expect, it } from 'vitest';

import {
  createParkedCart,
  deleteParkedSale,
  parseParkedCarts,
  parkSale,
  recallParkedSale,
  type ParkedCart,
  type PosParkedCartLine,
} from './pos-parking';

type CartLine = PosParkedCartLine & {
  discountType?: 'NONE' | 'AMOUNT' | 'PERCENT';
  discountValue?: string;
};

const baseCart: CartLine[] = [
  {
    id: 'prod-1:base',
    productId: 'prod-1',
    unitId: 'base',
    qtyInUnit: 2,
    discountType: 'NONE',
    discountValue: '',
  },
];

describe('pos-parking helpers', () => {
  it('creates parked carts with a fallback label and item count', () => {
    const parked = createParkedCart({
      cart: baseCart,
      customerId: 'cust-1',
      label: '   ',
      parkedAt: '2026-03-12T10:00:00.000Z',
      idFactory: () => 'parked-1',
    });

    expect(parked).toEqual<ParkedCart<CartLine>>({
      id: 'parked-1',
      label: 'Sale (1 items)',
      cart: baseCart,
      customerId: 'cust-1',
      parkedAt: '2026-03-12T10:00:00.000Z',
      itemCount: 1,
    });
  });

  it('parks a cart by appending a new parked sale', () => {
    const result = parkSale({
      parkedCarts: [],
      cart: baseCart,
      customerId: 'cust-1',
      label: 'Counter hold',
      parkedAt: '2026-03-12T10:00:00.000Z',
      idFactory: () => 'parked-1',
    });

    expect(result.parked.label).toBe('Counter hold');
    expect(result.parkedCarts).toHaveLength(1);
    expect(result.parkedCarts[0].id).toBe('parked-1');
  });

  it('recalls a parked sale, swaps the current cart, and filters invalid records', () => {
    const parkedCarts: ParkedCart<CartLine>[] = [
      {
        id: 'parked-1',
        label: 'Waiting customer',
        cart: [
          baseCart[0],
          {
            id: 'prod-missing:base',
            productId: 'prod-missing',
            unitId: 'base',
            qtyInUnit: 1,
          },
        ],
        customerId: 'cust-missing',
        parkedAt: '2026-03-12T10:00:00.000Z',
        itemCount: 2,
      },
    ];

    const result = recallParkedSale({
      parkedCarts,
      parkedId: 'parked-1',
      currentCart: [
        {
          id: 'prod-2:base',
          productId: 'prod-2',
          unitId: 'base',
          qtyInUnit: 3,
        },
      ],
      currentCustomerId: 'cust-2',
      productExists: (productId) => productId !== 'prod-missing',
      customerExists: (customerId) => customerId === 'cust-2',
      parkedAt: '2026-03-12T10:05:00.000Z',
      idFactory: () => 'parked-2',
    });

    expect(result).not.toBeNull();
    expect(result?.restoredCart).toEqual([baseCart[0]]);
    expect(result?.restoredCustomerId).toBe('');
    expect(result?.removedLineCount).toBe(1);
    expect(result?.missingCustomer).toBe(true);
    expect(result?.parkedCarts).toHaveLength(1);
    expect(result?.parkedCarts[0]).toMatchObject({
      id: 'parked-2',
      label: 'Swapped sale (1 items)',
      customerId: 'cust-2',
      itemCount: 1,
    });
  });

  it('deletes parked sales by id and safely parses storage payloads', () => {
    const parkedCarts: ParkedCart<CartLine>[] = [
      {
        id: 'parked-1',
        label: 'A',
        cart: baseCart,
        customerId: '',
        parkedAt: '2026-03-12T10:00:00.000Z',
        itemCount: 1,
      },
      {
        id: 'parked-2',
        label: 'B',
        cart: baseCart,
        customerId: '',
        parkedAt: '2026-03-12T10:01:00.000Z',
        itemCount: 1,
      },
    ];

    expect(deleteParkedSale(parkedCarts, 'parked-1')).toEqual([parkedCarts[1]]);
    expect(parseParkedCarts<CartLine>(JSON.stringify(parkedCarts))).toEqual(parkedCarts);
    expect(parseParkedCarts<CartLine>('not-json')).toEqual([]);
    expect(parseParkedCarts<CartLine>(JSON.stringify({ nope: true }))).toEqual([]);
  });
});
