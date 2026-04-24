'use client';

import { useCallback, useState } from 'react';

/**
 * Five state atoms cluster around a single concept: "the cashier is
 * asking for a whole-order discount, and if it's big enough we need a
 * manager to approve it." This hook owns them together so the POS
 * checkout, snapshot/restore path, and UI bindings can consume the
 * cluster through one handle.
 *
 * The DiscountType is kept as a plain string union parameter so the hook
 * doesn't need to import the POS-specific type and can be reused.
 */
type DiscountTypeBase = 'NONE' | 'PERCENT' | 'AMOUNT';

export type PosOrderDiscountSnapshot<TDiscountType extends string = DiscountTypeBase> = {
  orderDiscountType: TDiscountType;
  orderDiscountInput: string;
  discountManagerPin: string;
  discountReasonCode: string;
  discountReason: string;
};

export type PosOrderDiscountServicePayload<TDiscountType extends string = DiscountTypeBase> = {
  orderDiscountType: TDiscountType;
  orderDiscountValue: string;
  discountManagerPin?: string;
  discountReasonCode?: string;
  discountReason?: string;
};

export function usePosOrderDiscount<TDiscountType extends string = DiscountTypeBase>(
  initialType: TDiscountType = 'NONE' as TDiscountType
) {
  const [type, setType] = useState<TDiscountType>(initialType);
  const [input, setInput] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [reason, setReason] = useState('');

  /**
   * Setting the type to NONE always clears the input — otherwise a stale
   * "10" carries over when the cashier toggles the discount off, which
   * the reviewer is unlikely to notice until a sale goes out short.
   */
  const setTypeAndClearInput = useCallback((next: TDiscountType) => {
    setType(next);
    if (next === ('NONE' as TDiscountType)) {
      setInput('');
    }
  }, []);

  const reset = useCallback(() => {
    setType('NONE' as TDiscountType);
    setInput('');
    setManagerPin('');
    setReasonCode('');
    setReason('');
  }, []);

  const snapshot = useCallback((): PosOrderDiscountSnapshot<TDiscountType> => ({
    orderDiscountType: type,
    orderDiscountInput: input,
    discountManagerPin: managerPin,
    discountReasonCode: reasonCode,
    discountReason: reason,
  }), [type, input, managerPin, reasonCode, reason]);

  const restore = useCallback((snap: PosOrderDiscountSnapshot<TDiscountType>) => {
    setType(snap.orderDiscountType);
    setInput(snap.orderDiscountInput);
    setManagerPin(snap.discountManagerPin);
    setReasonCode(snap.discountReasonCode);
    setReason(snap.discountReason);
  }, []);

  /**
   * Serialise into the shape completeSaleAction expects. Empty manager
   * fields are converted to undefined so we don't send empty strings
   * that would fail reason-code or PIN validation on the server.
   */
  const toServicePayload = useCallback((): PosOrderDiscountServicePayload<TDiscountType> => ({
    orderDiscountType: type,
    orderDiscountValue: input,
    discountManagerPin: managerPin.trim() || undefined,
    discountReasonCode: reasonCode || undefined,
    discountReason: reason.trim() || undefined,
  }), [type, input, managerPin, reasonCode, reason]);

  return {
    // state
    type,
    input,
    managerPin,
    reasonCode,
    reason,
    // setters (raw — the reasonCode/reason/managerPin inputs wire
    // directly to these; the type setter goes through
    // setTypeAndClearInput so NONE also clears the input)
    setType: setTypeAndClearInput,
    setInput,
    setManagerPin,
    setReasonCode,
    setReason,
    // lifecycle
    reset,
    snapshot,
    restore,
    toServicePayload,
  };
}
