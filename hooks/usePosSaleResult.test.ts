import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { usePosSaleResult } from './usePosSaleResult';

const SUCCESS = {
  receiptId: 'inv-1',
  totalPence: 5000,
  transactionNumber: 'T-100',
};

describe('usePosSaleResult', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle with no success, no error, not completing, no next-customer flash', () => {
    const { result } = renderHook(() => usePosSaleResult());
    expect(result.current.saleSuccess).toBeNull();
    expect(result.current.saleError).toBeNull();
    expect(result.current.isCompletingSale).toBe(false);
    expect(result.current.nextCustomerReady).toBe(false);
    expect(result.current.lastReceiptId).toBe('');
  });

  describe('completion lifecycle', () => {
    it('beginCompletion sets isCompletingSale true and clears any prior error', () => {
      const { result } = renderHook(() => usePosSaleResult());
      act(() => result.current.setSaleError('previous failure'));
      expect(result.current.saleError).toBe('previous failure');

      act(() => result.current.beginCompletion());
      expect(result.current.isCompletingSale).toBe(true);
      expect(result.current.saleError).toBeNull();
    });

    it('endCompletion flips isCompletingSale back to false but leaves success/error intact', () => {
      const { result } = renderHook(() => usePosSaleResult());
      act(() => {
        result.current.beginCompletion();
        result.current.showSaleSuccess(SUCCESS, 3000);
        result.current.endCompletion();
      });
      expect(result.current.isCompletingSale).toBe(false);
      expect(result.current.saleSuccess).toEqual(SUCCESS);
    });
  });

  describe('showSaleSuccess', () => {
    it('sets success state and triggers the next-customer flash', () => {
      const { result } = renderHook(() => usePosSaleResult());
      act(() => result.current.showSaleSuccess(SUCCESS, 3000));
      expect(result.current.saleSuccess).toEqual(SUCCESS);
      expect(result.current.nextCustomerReady).toBe(true);
    });

    it('auto-dismisses saleSuccess after autoDismissMs', () => {
      const { result } = renderHook(() => usePosSaleResult());
      act(() => result.current.showSaleSuccess(SUCCESS, 3000));
      expect(result.current.saleSuccess).toEqual(SUCCESS);

      act(() => {
        vi.advanceTimersByTime(2999);
      });
      expect(result.current.saleSuccess).toEqual(SUCCESS);

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.saleSuccess).toBeNull();
    });

    it('does not schedule an auto-dismiss when autoDismissMs is 0', () => {
      const { result } = renderHook(() => usePosSaleResult());
      act(() => result.current.showSaleSuccess(SUCCESS, 0));
      act(() => {
        vi.advanceTimersByTime(60000);
      });
      expect(result.current.saleSuccess).toEqual(SUCCESS);
    });

    it('consecutive successes cancel the previous timer so the toast does not flash-dismiss', () => {
      const { result } = renderHook(() => usePosSaleResult());

      // Sale 1 — would auto-dismiss at 3000ms if not cancelled.
      act(() => result.current.showSaleSuccess({ ...SUCCESS, receiptId: 'inv-1' }, 3000));

      // After 2s the second sale lands. This must cancel sale 1's timer
      // otherwise the second toast would disappear at the 1s mark.
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      act(() => result.current.showSaleSuccess({ ...SUCCESS, receiptId: 'inv-2' }, 3000));
      expect(result.current.saleSuccess?.receiptId).toBe('inv-2');

      // 2.9s after sale 2 — below its 3000ms threshold, still visible.
      act(() => {
        vi.advanceTimersByTime(2900);
      });
      expect(result.current.saleSuccess?.receiptId).toBe('inv-2');

      // 3.0s after sale 2 — now it dismisses.
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(result.current.saleSuccess).toBeNull();
    });
  });

  describe('dismissSaleSuccess', () => {
    it('clears success and cancels any pending auto-dismiss', () => {
      const { result } = renderHook(() => usePosSaleResult());
      act(() => result.current.showSaleSuccess(SUCCESS, 3000));
      act(() => result.current.dismissSaleSuccess());
      expect(result.current.saleSuccess).toBeNull();

      // Advance past the original 3000ms — nothing should happen.
      act(() => vi.advanceTimersByTime(5000));
      expect(result.current.saleSuccess).toBeNull();
    });
  });

  describe('next-customer-ready flash', () => {
    it('auto-clears after nextCustomerReadyMs', () => {
      const { result } = renderHook(() => usePosSaleResult({ nextCustomerReadyMs: 2600 }));
      act(() => result.current.showSaleSuccess(SUCCESS, 3000));
      expect(result.current.nextCustomerReady).toBe(true);

      act(() => vi.advanceTimersByTime(2599));
      expect(result.current.nextCustomerReady).toBe(true);

      act(() => vi.advanceTimersByTime(1));
      expect(result.current.nextCustomerReady).toBe(false);
    });

    it('uses the default 2600ms when no option is provided', () => {
      const { result } = renderHook(() => usePosSaleResult());
      act(() => result.current.setNextCustomerReady(true));

      act(() => vi.advanceTimersByTime(2599));
      expect(result.current.nextCustomerReady).toBe(true);

      act(() => vi.advanceTimersByTime(1));
      expect(result.current.nextCustomerReady).toBe(false);
    });

    it('manual setNextCustomerReady(false) cancels the flash early', () => {
      const { result } = renderHook(() => usePosSaleResult({ nextCustomerReadyMs: 2600 }));
      act(() => result.current.showSaleSuccess(SUCCESS, 3000));
      act(() => result.current.setNextCustomerReady(false));
      expect(result.current.nextCustomerReady).toBe(false);
    });
  });

  describe('saleError', () => {
    it('setSaleError sets the banner', () => {
      const { result } = renderHook(() => usePosSaleResult());
      act(() => result.current.setSaleError('Network error'));
      expect(result.current.saleError).toBe('Network error');
    });

    it('dismissSaleError clears the banner', () => {
      const { result } = renderHook(() => usePosSaleResult());
      act(() => result.current.setSaleError('Network error'));
      act(() => result.current.dismissSaleError());
      expect(result.current.saleError).toBeNull();
    });
  });

  describe('lastReceiptId', () => {
    it('setLastReceiptId updates the stored id', () => {
      const { result } = renderHook(() => usePosSaleResult());
      act(() => result.current.setLastReceiptId('inv-42'));
      expect(result.current.lastReceiptId).toBe('inv-42');
    });
  });

  describe('unmount', () => {
    it('clears the pending auto-dismiss timer on unmount so it does not fire on a stale component', () => {
      const { result, unmount } = renderHook(() => usePosSaleResult());
      act(() => result.current.showSaleSuccess(SUCCESS, 3000));
      unmount();
      // If the unmount cleanup is missing, this would throw on setState
      // after unmount in React 18 strict mode; advancing timers exercises it.
      expect(() => {
        vi.advanceTimersByTime(5000);
      }).not.toThrow();
    });
  });
});
