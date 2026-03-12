'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  deleteParkedSale,
  PARKED_CARTS_STORAGE_KEY,
  parkSale,
  parseParkedCarts,
  recallParkedSale,
  type ParkedCart,
  type PosParkedCartLine,
  type RecallParkedSaleResult,
} from '@/lib/payments/pos-parking';

type UseParkedCartsOptions = {
  storageKey?: string;
};

type ParkCurrentCartInput<TCartLine extends PosParkedCartLine> = {
  cart: TCartLine[];
  customerId: string;
  label: string;
};

type RecallParkedCartInput<TCartLine extends PosParkedCartLine> = {
  parkedId: string;
  currentCart: TCartLine[];
  currentCustomerId: string;
  productExists: (productId: string) => boolean;
  customerExists: (customerId: string) => boolean;
};

export function useParkedCarts<TCartLine extends PosParkedCartLine = PosParkedCartLine>(
  options: UseParkedCartsOptions = {}
) {
  const { storageKey = PARKED_CARTS_STORAGE_KEY } = options;
  const [parkedCarts, setParkedCarts] = useState<ParkedCart<TCartLine>[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setParkedCarts(parseParkedCarts<TCartLine>(window.localStorage.getItem(storageKey)));
  }, [storageKey]);

  const saveParkedCarts = useCallback((nextParkedCarts: ParkedCart<TCartLine>[]) => {
    setParkedCarts(nextParkedCarts);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, JSON.stringify(nextParkedCarts));
    }
  }, [storageKey]);

  const parkCurrentCart = useCallback((input: ParkCurrentCartInput<TCartLine>) => {
    if (input.cart.length === 0) return null;

    const result = parkSale({
      parkedCarts,
      cart: input.cart,
      customerId: input.customerId,
      label: input.label,
    });

    saveParkedCarts(result.parkedCarts);
    return result;
  }, [parkedCarts, saveParkedCarts]);

  const recallParkedCart = useCallback((
    input: RecallParkedCartInput<TCartLine>
  ): RecallParkedSaleResult<TCartLine> | null => {
    const result = recallParkedSale({
      parkedCarts,
      parkedId: input.parkedId,
      currentCart: input.currentCart,
      currentCustomerId: input.currentCustomerId,
      productExists: input.productExists,
      customerExists: input.customerExists,
    });

    if (!result) return null;

    saveParkedCarts(result.parkedCarts);
    return result;
  }, [parkedCarts, saveParkedCarts]);

  const deleteParkedCart = useCallback((parkedId: string) => {
    saveParkedCarts(deleteParkedSale(parkedCarts, parkedId));
  }, [parkedCarts, saveParkedCarts]);

  return {
    parkedCarts,
    saveParkedCarts,
    parkCurrentCart,
    recallParkedCart,
    deleteParkedCart,
  };
}
