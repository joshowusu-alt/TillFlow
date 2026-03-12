import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePersistedPosCart } from './usePersistedPosCart';

type CartLine = {
  id: string;
  productId: string;
  unitId: string;
  qtyInUnit: number;
};

describe('usePersistedPosCart', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('restores saved cart state and hides the banner after the timeout', async () => {
    window.localStorage.setItem('pos.savedCart', JSON.stringify([
      { id: 'prod-1:base', productId: 'prod-1', unitId: 'base', qtyInUnit: 2 },
      { id: 'prod-missing:base', productId: 'prod-missing', unitId: 'base', qtyInUnit: 1 },
    ] satisfies CartLine[]));
    window.localStorage.setItem('pos.savedCustomer', 'cust-1');

    const { result } = renderHook(() => usePersistedPosCart<CartLine>({
      productExists: (productId) => productId !== 'prod-missing',
      customerExists: (customerId) => customerId === 'cust-1',
      restoredBannerMs: 5000,
    }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.cart).toEqual([
      { id: 'prod-1:base', productId: 'prod-1', unitId: 'base', qtyInUnit: 2 },
    ]);
    expect(result.current.customerId).toBe('cust-1');
    expect(result.current.cartRestored).toBe(true);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.cartRestored).toBe(false);
  });

  it('persists cart changes and clears storage on demand', async () => {
    const { result } = renderHook(() => usePersistedPosCart<CartLine>({
      productExists: () => true,
      customerExists: () => true,
    }));

    act(() => {
      result.current.setCart([
        { id: 'prod-2:base', productId: 'prod-2', unitId: 'base', qtyInUnit: 1 },
      ]);
      result.current.setCustomerId('cust-2');
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(window.localStorage.getItem('pos.savedCart')).toBe(JSON.stringify([
      { id: 'prod-2:base', productId: 'prod-2', unitId: 'base', qtyInUnit: 1 },
    ]));
    expect(window.localStorage.getItem('pos.savedCustomer')).toBe('cust-2');

    act(() => {
      result.current.clearSavedCart();
    });

    expect(window.localStorage.getItem('pos.savedCart')).toBeNull();
    expect(window.localStorage.getItem('pos.savedCustomer')).toBeNull();
  });
});
