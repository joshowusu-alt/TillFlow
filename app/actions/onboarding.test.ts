import { describe, expect, it } from 'vitest';
import { resolveReadinessExpectedCashPence } from './onboarding';

describe('resolveReadinessExpectedCashPence', () => {
  it('uses open shift expected cash as the source of truth', async () => {
    await expect(resolveReadinessExpectedCashPence({
      openShiftExpectedCashPence: [7_480_00, 125_00],
    })).resolves.toBe(7_605_00);
  });

  it('returns zero when no shift is open instead of showing a stale closed shift', async () => {
    await expect(resolveReadinessExpectedCashPence({
      openShiftExpectedCashPence: [],
    })).resolves.toBe(0);
  });

  it('keeps expected cash at zero until a till is opened', async () => {
    await expect(resolveReadinessExpectedCashPence({
      openShiftExpectedCashPence: [],
    })).resolves.toBe(0);
  });
});
