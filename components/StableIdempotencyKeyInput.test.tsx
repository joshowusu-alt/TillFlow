import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

let params = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useSearchParams: () => params,
}));

import StableIdempotencyKeyInput, { shouldRotateMoneyOperationKey } from './StableIdempotencyKeyInput';

function keyOf(container: HTMLElement) {
  return (container.querySelector('input[name="idempotencyKey"]') as HTMLInputElement).value;
}

describe('StableIdempotencyKeyInput', () => {
  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
    params = new URLSearchParams('');
  });

  it('only rotates for the record named in ?paid=', () => {
    expect(shouldRotateMoneyOperationKey('expense-payment:exp1', 'exp1')).toBe(true);
    expect(shouldRotateMoneyOperationKey('expense-payment:exp1', 'exp2')).toBe(false);
    expect(shouldRotateMoneyOperationKey('expense-payment:exp1', null)).toBe(false);
    expect(shouldRotateMoneyOperationKey('expense-payment:exp1', '')).toBe(false);
  });

  it('keeps the same key across remounts, then mints a new one after the paid redirect', () => {
    const first = render(<StableIdempotencyKeyInput scope="expense-payment:exp1" />);
    const key1 = keyOf(first.container);
    cleanup();
    const second = render(<StableIdempotencyKeyInput scope="expense-payment:exp1" />);
    expect(keyOf(second.container)).toBe(key1);
    cleanup();

    params = new URLSearchParams('paid=exp1');
    const third = render(<StableIdempotencyKeyInput scope="expense-payment:exp1" />);
    const key3 = keyOf(third.container);
    expect(key3).not.toBe(key1);
    cleanup();

    // A paid marker for a different record leaves this scope's key alone.
    params = new URLSearchParams('paid=other');
    const fourth = render(<StableIdempotencyKeyInput scope="expense-payment:exp1" />);
    expect(keyOf(fourth.container)).toBe(key3);
  });
});
