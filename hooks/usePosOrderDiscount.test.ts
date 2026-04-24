import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { usePosOrderDiscount, type PosOrderDiscountSnapshot } from './usePosOrderDiscount';

type DiscountType = 'NONE' | 'PERCENT' | 'AMOUNT';

describe('usePosOrderDiscount', () => {
  it('starts with NONE type and empty fields by default', () => {
    const { result } = renderHook(() => usePosOrderDiscount<DiscountType>());
    expect(result.current.type).toBe('NONE');
    expect(result.current.input).toBe('');
    expect(result.current.managerPin).toBe('');
    expect(result.current.reasonCode).toBe('');
    expect(result.current.reason).toBe('');
  });

  it('respects an initial discount type override', () => {
    const { result } = renderHook(() => usePosOrderDiscount<DiscountType>('PERCENT'));
    expect(result.current.type).toBe('PERCENT');
  });

  it('setType(NONE) clears the input — prevents stale "10" carrying into the next sale', () => {
    const { result } = renderHook(() => usePosOrderDiscount<DiscountType>());
    act(() => {
      result.current.setType('PERCENT');
      result.current.setInput('10');
    });
    expect(result.current.input).toBe('10');

    act(() => {
      result.current.setType('NONE');
    });
    expect(result.current.type).toBe('NONE');
    expect(result.current.input).toBe('');
  });

  it('setType to a non-NONE value preserves the input', () => {
    const { result } = renderHook(() => usePosOrderDiscount<DiscountType>());
    act(() => {
      result.current.setType('PERCENT');
      result.current.setInput('10');
      result.current.setType('AMOUNT');
    });
    expect(result.current.type).toBe('AMOUNT');
    expect(result.current.input).toBe('10');
  });

  it('individual setters are pass-through for the remaining fields', () => {
    const { result } = renderHook(() => usePosOrderDiscount<DiscountType>());
    act(() => {
      result.current.setManagerPin('9999');
      result.current.setReasonCode('LOYALTY');
      result.current.setReason('VIP customer');
    });
    expect(result.current.managerPin).toBe('9999');
    expect(result.current.reasonCode).toBe('LOYALTY');
    expect(result.current.reason).toBe('VIP customer');
  });

  it('reset() clears every field and returns to NONE', () => {
    const { result } = renderHook(() => usePosOrderDiscount<DiscountType>());
    act(() => {
      result.current.setType('AMOUNT');
      result.current.setInput('200');
      result.current.setManagerPin('1111');
      result.current.setReasonCode('STAFF_DEAL');
      result.current.setReason('end-of-day markdown');
      result.current.reset();
    });
    expect(result.current.type).toBe('NONE');
    expect(result.current.input).toBe('');
    expect(result.current.managerPin).toBe('');
    expect(result.current.reasonCode).toBe('');
    expect(result.current.reason).toBe('');
  });

  it('snapshot() captures every field in the sale-completion shape', () => {
    const { result } = renderHook(() => usePosOrderDiscount<DiscountType>());
    act(() => {
      result.current.setType('PERCENT');
      result.current.setInput('15');
      result.current.setManagerPin('5555');
      result.current.setReasonCode('MANAGER_APPROVED');
      result.current.setReason('supervisor override');
    });

    const snap = result.current.snapshot();
    expect(snap).toEqual({
      orderDiscountType: 'PERCENT',
      orderDiscountInput: '15',
      discountManagerPin: '5555',
      discountReasonCode: 'MANAGER_APPROVED',
      discountReason: 'supervisor override',
    });
  });

  it('restore() round-trips a snapshot back into state', () => {
    const { result } = renderHook(() => usePosOrderDiscount<DiscountType>());
    const snap: PosOrderDiscountSnapshot<DiscountType> = {
      orderDiscountType: 'AMOUNT',
      orderDiscountInput: '500',
      discountManagerPin: '7777',
      discountReasonCode: 'LOYALTY',
      discountReason: 'anniversary discount',
    };
    act(() => result.current.restore(snap));
    expect(result.current.type).toBe('AMOUNT');
    expect(result.current.input).toBe('500');
    expect(result.current.managerPin).toBe('7777');
    expect(result.current.reasonCode).toBe('LOYALTY');
    expect(result.current.reason).toBe('anniversary discount');
  });

  it('restore() accepts objects with additional fields (structural typing)', () => {
    const { result } = renderHook(() => usePosOrderDiscount<DiscountType>());
    // Callers often pass the full SaleCompletionSnapshot; the hook should
    // pick off the 5 fields it needs without complaining.
    const bigSnap = {
      orderDiscountType: 'PERCENT' as const,
      orderDiscountInput: '25',
      discountManagerPin: '0000',
      discountReasonCode: '',
      discountReason: '',
      cart: [],
      customerId: 'cust-1',
      anythingElse: true,
    };
    act(() => result.current.restore(bigSnap));
    expect(result.current.type).toBe('PERCENT');
    expect(result.current.input).toBe('25');
  });

  it('toServicePayload() converts empty-string manager fields to undefined', () => {
    // The server's reason-code / PIN validators reject empty strings;
    // they need to be absent to count as "no override supplied".
    const { result } = renderHook(() => usePosOrderDiscount<DiscountType>());
    act(() => {
      result.current.setType('PERCENT');
      result.current.setInput('10');
    });
    const payload = result.current.toServicePayload();
    expect(payload).toEqual({
      orderDiscountType: 'PERCENT',
      orderDiscountValue: '10',
      discountManagerPin: undefined,
      discountReasonCode: undefined,
      discountReason: undefined,
    });
  });

  it('toServicePayload() trims whitespace from managerPin and reason', () => {
    const { result } = renderHook(() => usePosOrderDiscount<DiscountType>());
    act(() => {
      result.current.setType('AMOUNT');
      result.current.setInput('100');
      result.current.setManagerPin('  1234  ');
      result.current.setReasonCode('STAFF_DEAL');
      result.current.setReason('   store credit   ');
    });
    const payload = result.current.toServicePayload();
    expect(payload.discountManagerPin).toBe('1234');
    expect(payload.discountReason).toBe('store credit');
    expect(payload.discountReasonCode).toBe('STAFF_DEAL');
  });

  it('toServicePayload() treats pin/reason that become empty after trim as undefined', () => {
    const { result } = renderHook(() => usePosOrderDiscount<DiscountType>());
    act(() => {
      result.current.setType('PERCENT');
      result.current.setInput('5');
      result.current.setManagerPin('    ');
      result.current.setReason('   ');
    });
    const payload = result.current.toServicePayload();
    expect(payload.discountManagerPin).toBeUndefined();
    expect(payload.discountReason).toBeUndefined();
  });
});
