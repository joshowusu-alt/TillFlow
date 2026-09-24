import { describe, expect, it } from 'vitest';
import { resolveReadinessExpectedCashPence } from '@/lib/reports/home-expected-cash';

describe('resolveReadinessExpectedCashPence', () => {
  it('sums scoped open-shift drawer entries', async () => {
    await expect(resolveReadinessExpectedCashPence({
      openShifts: [
        {
          businessId: 'biz',
          storeId: 'store',
          tillId: 'till-1',
          shiftId: 'shift-1',
          entries: [{ entryType: 'OPEN_FLOAT', amountPence: 7_480_00, businessId: 'biz', storeId: 'store', tillId: 'till-1', shiftId: 'shift-1' }],
        },
        {
          businessId: 'biz',
          storeId: 'store',
          tillId: 'till-2',
          shiftId: 'shift-2',
          entries: [{ entryType: 'CASH_SALE', amountPence: 125_00, businessId: 'biz', storeId: 'store', tillId: 'till-2', shiftId: 'shift-2' }],
        },
      ],
    })).resolves.toBe(7_605_00);
  });

  it('returns null when no shift is open', async () => {
    await expect(resolveReadinessExpectedCashPence({
      openShifts: [],
    })).resolves.toBeNull();
  });
});
