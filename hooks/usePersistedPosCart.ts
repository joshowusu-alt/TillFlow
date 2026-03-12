'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  POS_CART_CUSTOMER_STORAGE_KEY,
  POS_CART_STORAGE_KEY,
  restorePersistedCart,
  type PersistedCartLine,
} from '@/lib/payments/pos-persistence';

type UsePersistedPosCartOptions<TCartLine extends PersistedCartLine> = {
  productExists: (productId: string) => boolean;
  customerExists: (customerId: string) => boolean;
  cartStorageKey?: string;
  customerStorageKey?: string;
  restoredBannerMs?: number;
};

export function usePersistedPosCart<TCartLine extends PersistedCartLine>(
  options: UsePersistedPosCartOptions<TCartLine>
) {
  const {
    productExists,
    customerExists,
    cartStorageKey = POS_CART_STORAGE_KEY,
    customerStorageKey = POS_CART_CUSTOMER_STORAGE_KEY,
    restoredBannerMs = 5000,
  } = options;

  const [cart, setCart] = useState<TCartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [cartRestored, setCartRestored] = useState(false);
  const cartInitialized = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || cartInitialized.current) return;
    cartInitialized.current = true;

    const restored = restorePersistedCart<TCartLine>({
      savedCartRaw: window.localStorage.getItem(cartStorageKey),
      savedCustomerRaw: window.localStorage.getItem(customerStorageKey),
      productExists,
      customerExists,
    });

    if (restored.cart.length > 0) {
      setCart(restored.cart);
      setCartRestored(true);
      window.setTimeout(() => setCartRestored(false), restoredBannerMs);
    }

    if (restored.customerId) {
      setCustomerId(restored.customerId);
    }
  }, [cartStorageKey, customerStorageKey, customerExists, productExists, restoredBannerMs]);

  useEffect(() => {
    if (typeof window === 'undefined' || !cartInitialized.current) return;

    if (cart.length > 0) {
      window.localStorage.setItem(cartStorageKey, JSON.stringify(cart));
      if (customerId) {
        window.localStorage.setItem(customerStorageKey, customerId);
      } else {
        window.localStorage.removeItem(customerStorageKey);
      }
      return;
    }

    window.localStorage.removeItem(cartStorageKey);
    window.localStorage.removeItem(customerStorageKey);
  }, [cart, cartStorageKey, customerId, customerStorageKey]);

  const clearSavedCart = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(cartStorageKey);
      window.localStorage.removeItem(customerStorageKey);
    }
  }, [cartStorageKey, customerStorageKey]);

  return {
    cart,
    setCart,
    customerId,
    setCustomerId,
    cartRestored,
    clearSavedCart,
  };
}
