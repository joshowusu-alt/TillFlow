import { describe, expect, it } from 'vitest';
import { resolveReadinessExpectedCashPence } from './onboarding';

describe('resolveReadinessExpectedCashPence', () => {
  it('uses open shift expected cash as the source of truth', () => {
    expect(resolveReadinessExpectedCashPence({
      openShiftExpectedCashPence: [7_480_00, 125_00],
      lastClosedShiftExpectedCashPence: 4_177_50,
      openingBalanceCashPence: 0,
      cashOnHandEstimatePence: 99_999_00,
    })).toBe(7_605_00);
  });

  it('uses the last closed shift when no shift is open', () => {
    expect(resolveReadinessExpectedCashPence({
      openShiftExpectedCashPence: [],
      lastClosedShiftExpectedCashPence: 7_480_00,
      openingBalanceCashPence: 0,
      cashOnHandEstimatePence: 99_999_00,
    })).toBe(7_480_00);
  });

  it('only falls back to opening balance when there is no shift history', () => {
    expect(resolveReadinessExpectedCashPence({
      openShiftExpectedCashPence: [],
      lastClosedShiftExpectedCashPence: null,
      openingBalanceCashPence: 250_00,
      cashOnHandEstimatePence: 500_00,
    })).toBe(250_00);
  });
});
