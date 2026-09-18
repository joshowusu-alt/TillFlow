import { describe, expect, it } from 'vitest';
import { computeCashHandover } from './cash-handover';

describe('computeCashHandover', () => {
  it('does not claim the full float can be retained before cash is counted', () => {
    expect(
      computeCashHandover({
        expectedCashPence: 20_000,
        actualCashPence: null,
        openingFloatPence: 20_000,
      }),
    ).toEqual({
      expectedCashPence: 20_000,
      actualCashPence: null,
      variancePence: null,
      openingFloatPence: 20_000,
      retainedPence: null,
      handedOverPence: null,
      floatShortfallPence: null,
      canRetainFullFloat: false,
      isEstimate: true,
    });
  });

  it('retains the opening float and hands over the surplus when counted cash covers the float', () => {
    expect(
      computeCashHandover({
        expectedCashPence: 45_000,
        actualCashPence: 45_000,
        openingFloatPence: 20_000,
      }),
    ).toMatchObject({
      retainedPence: 20_000,
      handedOverPence: 25_000,
      floatShortfallPence: 0,
      canRetainFullFloat: true,
      variancePence: 0,
      isEstimate: false,
    });
  });

  it('does not retain the full float when counted cash is below the opening float', () => {
    expect(
      computeCashHandover({
        expectedCashPence: 20_000,
        actualCashPence: 1_500,
        openingFloatPence: 20_000,
      }),
    ).toEqual({
      expectedCashPence: 20_000,
      actualCashPence: 1_500,
      variancePence: -18_500,
      openingFloatPence: 20_000,
      retainedPence: 1_500,
      handedOverPence: 0,
      floatShortfallPence: 18_500,
      canRetainFullFloat: false,
      isEstimate: false,
    });
  });

  it('treats a zero count as a full float shortfall and nothing handed over', () => {
    expect(
      computeCashHandover({
        expectedCashPence: 0,
        actualCashPence: 0,
        openingFloatPence: 20_000,
      }),
    ).toMatchObject({
      retainedPence: 0,
      handedOverPence: 0,
      floatShortfallPence: 20_000,
      canRetainFullFloat: false,
    });
  });
});
