import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useStagedProductSelection } from './useStagedProductSelection';

const product = {
  id: 'prod-1',
  barcode: '12345',
  units: [
    { id: 'pack', isBaseUnit: false },
    { id: 'piece', isBaseUnit: true },
  ],
};

describe('useStagedProductSelection', () => {
  it('stages a product with its base unit selected', () => {
    const onAddToCart = vi.fn();
    const { result } = renderHook(() => useStagedProductSelection({ onAddToCart }));

    act(() => {
      result.current.stageProduct(product);
    });

    expect(result.current.stagedProduct).toEqual(product);
    expect(result.current.stagedUnitId).toBe('piece');
    expect(result.current.stagedQty).toBe('1');
  });

  it('commits staged products with normalized quantity and clears state', () => {
    const onAddToCart = vi.fn();
    const { result } = renderHook(() => useStagedProductSelection({ onAddToCart }));

    act(() => {
      result.current.stageProduct(product);
      result.current.setStagedUnitId('pack');
      result.current.setStagedQty('3.9');
    });

    act(() => {
      expect(result.current.commitStagedProduct()).toBe(true);
    });

    expect(onAddToCart).toHaveBeenCalledWith({
      productId: 'prod-1',
      unitId: 'pack',
      qtyInUnit: 3,
    });
    expect(result.current.stagedProduct).toBeNull();
    expect(result.current.stagedUnitId).toBe('');
    expect(result.current.stagedQty).toBe('1');
  });
});
