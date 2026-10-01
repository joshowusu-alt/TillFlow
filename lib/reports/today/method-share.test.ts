import { describe, expect, it } from 'vitest';
import { paymentMixPresentation } from '@/lib/reports/today/method-share';

describe('payment mix presentation', () => {
  it('shows a normal positive mix that rounds to about 100 percent', () => {
    const mix = paymentMixPresentation([70_000, 50_000]);
    expect(mix.showBar).toBe(true);
    expect(mix.shares).toEqual([58, 42]);
    const total = mix.shares.reduce<number>((sum, share) => sum + (share ?? 0), 0);
    expect(total).toBe(100);
  });

  it('keeps rounded shares near 100 percent', () => {
    const mix = paymentMixPresentation([100, 100, 100]);
    expect(mix.showBar).toBe(true);
    expect(mix.shares).toEqual([33, 33, 33]);
    const total = mix.shares.reduce<number>((sum, share) => sum + (share ?? 0), 0);
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
  });

  it('omits every percentage when the total is zero', () => {
    expect(paymentMixPresentation([0, 0])).toEqual({ shares: [null, null], showBar: false });
  });

  it('omits every percentage when the total is negative', () => {
    expect(paymentMixPresentation([-20, -50])).toEqual({ shares: [null, null], showBar: false });
  });

  it('omits every percentage when one method is negative, even if the total is positive', () => {
    const mix = paymentMixPresentation([8_000, 2_000, 0, -500]);
    expect(mix.showBar).toBe(false);
    expect(mix.shares).toEqual([null, null, null, null]);
  });

  it('omits every percentage when every method is negative', () => {
    expect(paymentMixPresentation([-100, -40])).toEqual({ shares: [null, null], showBar: false });
  });

  it('leaves a zero-value method without a percentage inside a positive mix', () => {
    const mix = paymentMixPresentation([50, 50, 0]);
    expect(mix.showBar).toBe(true);
    expect(mix.shares).toEqual([50, 50, null]);
  });

  it('never returns NaN or Infinity', () => {
    expect(paymentMixPresentation([Number.NaN, 100])).toEqual({ shares: [null, null], showBar: false });
    expect(paymentMixPresentation([100, Number.POSITIVE_INFINITY])).toEqual({ shares: [null, null], showBar: false });
  });
});
