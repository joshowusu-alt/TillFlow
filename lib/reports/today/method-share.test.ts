import { describe, expect, it } from 'vitest';
import { paymentMethodSharePercent } from '@/lib/reports/today/method-share';

describe('payment method share', () => {
  it('shows a positive mix', () => {
    expect(paymentMethodSharePercent(70_000, 120_000)).toBe(58);
    expect(paymentMethodSharePercent(50_000, 120_000)).toBe(42);
  });

  it('omits a percentage when the total is zero', () => {
    expect(paymentMethodSharePercent(0, 0)).toBeNull();
    expect(paymentMethodSharePercent(100, 0)).toBeNull();
  });

  it('omits a percentage when the net total is negative', () => {
    expect(paymentMethodSharePercent(100, -50)).toBeNull();
    expect(paymentMethodSharePercent(-20, -50)).toBeNull();
  });

  it('shows only meaningful positive shares in a mixed list', () => {
    const total = 100;
    expect(paymentMethodSharePercent(80, total)).toBe(80);
    expect(paymentMethodSharePercent(0, total)).toBeNull();
    expect(paymentMethodSharePercent(-10, total)).toBeNull();
  });

  it('never returns NaN or Infinity', () => {
    expect(paymentMethodSharePercent(Number.NaN, 100)).toBeNull();
    expect(paymentMethodSharePercent(100, Number.POSITIVE_INFINITY)).toBeNull();
    expect(paymentMethodSharePercent(1, 10_000)).toBeNull();
  });
});