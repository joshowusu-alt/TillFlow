import { describe, expect, it } from 'vitest';

import { parsePersistedCart, restorePersistedCart, type PersistedCartLine } from './pos-persistence';

type CartLine = PersistedCartLine & {
  id: string;
  unitId: string;
  qtyInUnit: number;
};

const savedCart: CartLine[] = [
  { id: 'prod-1:base', productId: 'prod-1', unitId: 'base', qtyInUnit: 2 },
  { id: 'prod-missing:base', productId: 'prod-missing', unitId: 'base', qtyInUnit: 1 },
];

describe('pos-persistence helpers', () => {
  it('parses only array cart payloads and ignores invalid JSON', () => {
    expect(parsePersistedCart<CartLine>(JSON.stringify(savedCart))).toEqual(savedCart);
    expect(parsePersistedCart<CartLine>('not-json')).toEqual([]);
    expect(parsePersistedCart<CartLine>(JSON.stringify({ nope: true }))).toEqual([]);
  });

  it('restores only valid product lines and customer ids', () => {
    const restored = restorePersistedCart<CartLine>({
      savedCartRaw: JSON.stringify(savedCart),
      savedCustomerRaw: 'cust-1',
      productExists: (productId) => productId !== 'prod-missing',
      customerExists: (customerId) => customerId === 'cust-1',
    });

    expect(restored.cart).toEqual([savedCart[0]]);
    expect(restored.customerId).toBe('cust-1');
    expect(restored.restored).toBe(true);
  });

  it('returns empty restore state when nothing valid remains', () => {
    const restored = restorePersistedCart<CartLine>({
      savedCartRaw: JSON.stringify(savedCart),
      savedCustomerRaw: 'cust-missing',
      productExists: () => false,
      customerExists: () => false,
    });

    expect(restored).toEqual({ cart: [], customerId: '', restored: false });
  });
});
