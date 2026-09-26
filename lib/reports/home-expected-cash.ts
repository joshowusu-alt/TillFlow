import { expectedCashPenceFromEntries, type ExpectedCashEntry } from '@/lib/reports/expected-cash';

type OpenShiftCashInput = {
  businessId?: string;
  storeId?: string;
  tillId?: string;
  shiftId?: string;
  entries: ExpectedCashEntry[];
};

/**
 * Open-shift expected cash from scoped drawer entries.
 * No open shift returns null. Stored Shift totals are not an input.
 */
export async function resolveReadinessExpectedCashPence(input: {
  openShifts?: OpenShiftCashInput[];
}): Promise<number | null> {
  if (!input.openShifts) {
    throw new Error('open shifts with drawer entries are required');
  }
  if (input.openShifts.length === 0) return null;
  return input.openShifts.reduce(
    (sum, shift) =>
      sum +
      expectedCashPenceFromEntries(shift.entries, {
        businessId: shift.businessId,
        storeId: shift.storeId,
        tillId: shift.tillId,
        shiftId: shift.shiftId,
      }),
    0,
  );
}
