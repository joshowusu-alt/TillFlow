'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type PosSaleSuccess = {
  receiptId: string;
  totalPence: number;
  transactionNumber: string | null;
};

type UsePosSaleResultOptions = {
  /**
   * How long the "ready for next customer" flag stays true after a
   * completed sale. The existing POS uses 2.6s so the cashier briefly
   * sees the celebratory banner before the UI quiets back down.
   */
  nextCustomerReadyMs?: number;
};

/**
 * Owns the UI-only cluster around "did the sale go through?" —
 *   - success toast + auto-dismiss
 *   - error banner + manual dismiss
 *   - completion-in-progress flag (drives button disabled state)
 *   - next-customer-ready flash that auto-clears
 *   - the receipt id of the most recent completed sale
 *
 * Callers own localStorage hydration for lastReceiptId because the
 * storage key is business-scoped and outside this hook's concern.
 */
export function usePosSaleResult(options: UsePosSaleResultOptions = {}) {
  const nextCustomerReadyMs = options.nextCustomerReadyMs ?? 2600;

  const [lastReceiptId, setLastReceiptId] = useState('');
  const [saleSuccess, setSaleSuccess] = useState<PosSaleSuccess | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [isCompletingSale, setIsCompletingSale] = useState(false);
  const [nextCustomerReady, setNextCustomerReady] = useState(false);

  // One timer cancels the toast; a separate effect cancels the
  // next-customer-ready flash. Using refs so consecutive sales replace
  // the previous timer instead of leaking it.
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSuccessTimer = useCallback(() => {
    if (successTimerRef.current !== null) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  }, []);

  const dismissSaleSuccess = useCallback(() => {
    clearSuccessTimer();
    setSaleSuccess(null);
  }, [clearSuccessTimer]);

  const showSaleSuccess = useCallback(
    (success: PosSaleSuccess, autoDismissMs: number) => {
      clearSuccessTimer();
      setSaleSuccess(success);
      setNextCustomerReady(true);
      if (autoDismissMs > 0) {
        successTimerRef.current = setTimeout(() => {
          setSaleSuccess(null);
          successTimerRef.current = null;
        }, autoDismissMs);
      }
    },
    [clearSuccessTimer]
  );

  const dismissSaleError = useCallback(() => {
    setSaleError(null);
  }, []);

  const beginCompletion = useCallback(() => {
    setIsCompletingSale(true);
    setSaleError(null);
  }, []);

  const endCompletion = useCallback(() => {
    setIsCompletingSale(false);
  }, []);

  // Keep the next-customer-ready flash timer local to the hook.
  useEffect(() => {
    if (!nextCustomerReady) return;
    const timer = window.setTimeout(
      () => setNextCustomerReady(false),
      nextCustomerReadyMs
    );
    return () => window.clearTimeout(timer);
  }, [nextCustomerReady, nextCustomerReadyMs]);

  // Clean up any pending success-toast timer on unmount.
  useEffect(() => clearSuccessTimer, [clearSuccessTimer]);

  return {
    // read state
    lastReceiptId,
    saleSuccess,
    saleError,
    isCompletingSale,
    nextCustomerReady,
    // actions
    setLastReceiptId,
    showSaleSuccess,
    dismissSaleSuccess,
    setSaleError,
    dismissSaleError,
    beginCompletion,
    endCompletion,
    setNextCustomerReady,
  };
}
