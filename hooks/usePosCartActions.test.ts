import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { usePosCartActions } from './usePosCartActions';
import type { PosCartLine } from '@/lib/payments/pos-cart';

type TestLine = PosCartLine;

const initialCart: TestLine[] = [
  { id: 'prod-1:piece', productId: 'prod-1', unitId: 'piece', qtyInUnit: 2, discountType: 'NONE', discountValue: '' },
];

function renderCartActions(options?: {
  cart?: TestLine[];
  clampQtyInUnit?: (productId: string, unitId: string, desiredQty: number, excludeLineId?: string) => number;
}) {
  const pushUndo = vi.fn();
  const onFirstCartLine = vi.fn();
  const clampQtyInUnit = options?.clampQtyInUnit ?? vi.fn((_, __, desiredQty) => desiredQty);

  const hook = renderHook(() => {
    const [cart, setCart] = useState<TestLine[]>(options?.cart ?? initialCart);
    const actions = usePosCartActions<TestLine>({
      cart,
      setCart,
      pushUndo,
      clampQtyInUnit,
      onFirstCartLine,
    });

    return { cart, ...actions };
  });

  return { ...hook, pushUndo, onFirstCartLine, clampQtyInUnit };
}

describe('usePosCartActions', () => {
  it('adds a new line with the default no-discount shape and prefetches on an empty cart', () => {
    const { result, onFirstCartLine } = renderCartActions({ cart: [] });

    act(() => {
      result.current.addToCart({ productId: 'prod-1', unitId: 'piece', qtyInUnit: 3 });
    });

    expect(onFirstCartLine).toHaveBeenCalledTimes(1);
    expect(result.current.cart).toEqual([
      { id: 'prod-1:piece', productId: 'prod-1', unitId: 'piece', qtyInUnit: 3, discountType: 'NONE', discountValue: '' },
    ]);
  });

  it('merges existing lines through the stock clamp', () => {
    const clampQtyInUnit = vi.fn((_, __, desiredQty) => Math.min(desiredQty, 4));
    const { result } = renderCartActions({ clampQtyInUnit });

    act(() => {
      result.current.addToCart({ productId: 'prod-1', unitId: 'piece', qtyInUnit: 5 });
    });

    expect(clampQtyInUnit).toHaveBeenCalledWith('prod-1', 'piece', 7, 'prod-1:piece');
    expect(result.current.cart[0].qtyInUnit).toBe(4);
  });

  it('removes lines with an undo snapshot and clears active drafts', () => {
    const { result, pushUndo } = renderCartActions();

    act(() => {
      result.current.setActiveLineId('prod-1:piece');
      result.current.setQtyDrafts({ 'prod-1:piece': '9' });
    });

    act(() => {
      result.current.removeLine('prod-1:piece');
    });

    expect(pushUndo).toHaveBeenCalledWith(initialCart);
    expect(result.current.cart).toEqual([]);
    expect(result.current.qtyDrafts).toEqual({});
    expect(result.current.activeLineId).toBeNull();
  });

  it('commits quantity drafts by flooring and clamping numeric input', () => {
    const clampQtyInUnit = vi.fn((_, __, desiredQty) => Math.min(desiredQty, 5));
    const { result } = renderCartActions({ clampQtyInUnit });

    act(() => {
      result.current.setQtyDrafts({ 'prod-1:piece': '7.8' });
    });

    act(() => {
      result.current.commitLineQty(result.current.cart[0]);
    });

    expect(clampQtyInUnit).toHaveBeenCalledWith('prod-1', 'piece', 7, 'prod-1:piece');
    expect(result.current.cart[0].qtyInUnit).toBe(5);
    expect(result.current.qtyDrafts).toEqual({});
  });

  it('increments and decrements quantities with undo snapshots', () => {
    const { result, pushUndo } = renderCartActions();

    act(() => {
      result.current.incrementLineQty(result.current.cart[0]);
    });

    expect(result.current.cart[0].qtyInUnit).toBe(3);

    act(() => {
      result.current.decrementLineQty(result.current.cart[0]);
    });

    expect(result.current.cart[0].qtyInUnit).toBe(2);
    expect(pushUndo).toHaveBeenCalledTimes(2);
  });

  it('updates line-level discount and clears stale values when discount is NONE', () => {
    const { result } = renderCartActions();

    act(() => {
      result.current.setLineDiscountType('prod-1:piece', 'PERCENT');
      result.current.setLineDiscountValue('prod-1:piece', '10');
    });

    expect(result.current.cart[0]).toMatchObject({ discountType: 'PERCENT', discountValue: '10' });

    act(() => {
      result.current.setLineDiscountType('prod-1:piece', 'NONE');
    });

    expect(result.current.cart[0]).toMatchObject({ discountType: 'NONE', discountValue: '' });
  });

  it('changes a line unit using the POS id convention and resets quantity', () => {
    const { result } = renderCartActions();

    act(() => {
      result.current.changeLineUnit('prod-1:piece', 'pack');
    });

    expect(result.current.cart[0]).toMatchObject({
      id: 'prod-1:pack',
      unitId: 'pack',
      qtyInUnit: 1,
    });
  });
});
