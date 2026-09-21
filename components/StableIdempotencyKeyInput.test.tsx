import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

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
    expect(shouldRotateMoneyOperationKey('supplier-payment:inv1', 'inv1')).toBe(true);
    expect(shouldRotateMoneyOperationKey('customer-receipt:sale1', 'sale1')).toBe(true);
    expect(shouldRotateMoneyOperationKey('expense-payment:exp1', null)).toBe(false);
    expect(shouldRotateMoneyOperationKey('expense-payment:exp1', '')).toBe(false);
  });

  it('keeps one key for a double submit, then mints a new key for the next intention', () => {
    const view = render(
      <form>
        <StableIdempotencyKeyInput scope="supplier-payment:inv1" />
        <button type="submit">Record payment</button>
      </form>,
    );
    const first = keyOf(view.container);
    fireEvent.submit(view.container.querySelector('form')!);
    fireEvent.submit(view.container.querySelector('form')!);
    expect(keyOf(view.container)).toBe(first);

    cleanup();
    const remounted = render(
      <form>
        <StableIdempotencyKeyInput scope="supplier-payment:inv1" />
      </form>,
    );
    expect(keyOf(remounted.container)).toBe(first);
    cleanup();

    params = new URLSearchParams('paid=inv1&pay=p1');
    const next = render(
      <form>
        <StableIdempotencyKeyInput scope="supplier-payment:inv1" />
      </form>,
    );
    expect(keyOf(next.container)).not.toBe(first);
  });

  it('reuses the in-flight key when the same success page is shown again before the retry is acknowledged', () => {
    params = new URLSearchParams('paid=exp1&pay=p1');
    const first = render(
      <form>
        <StableIdempotencyKeyInput scope="expense-payment:exp1" />
      </form>,
    );
    const key1 = keyOf(first.container);
    fireEvent.submit(first.container.querySelector('form')!);
    cleanup();

    const retry = render(
      <form>
        <StableIdempotencyKeyInput scope="expense-payment:exp1" />
      </form>,
    );
    expect(keyOf(retry.container)).toBe(key1);
  });

  it('rotates on each successive ?pay= while ?paid= stays the same', () => {
    params = new URLSearchParams('paid=exp1&pay=p1');
    const first = render(<StableIdempotencyKeyInput scope="expense-payment:exp1" />);
    const key1 = keyOf(first.container);
    cleanup();

    params = new URLSearchParams('paid=exp1&pay=p2');
    const second = render(<StableIdempotencyKeyInput scope="expense-payment:exp1" />);
    const key2 = keyOf(second.container);
    expect(key2).not.toBe(key1);
    cleanup();

    params = new URLSearchParams('paid=other&pay=p3');
    const third = render(<StableIdempotencyKeyInput scope="expense-payment:exp1" />);
    expect(keyOf(third.container)).toBe(key2);
  });

  it('keeps the same key across a remount before any submit', () => {
    const first = render(<StableIdempotencyKeyInput scope="customer-receipt:sale1" />);
    const key1 = keyOf(first.container);
    cleanup();
    const second = render(<StableIdempotencyKeyInput scope="customer-receipt:sale1" />);
    expect(keyOf(second.container)).toBe(key1);
  });
});
