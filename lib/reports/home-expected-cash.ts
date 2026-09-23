import { expectedCashPenceFromEntries, type ExpectedCashEntry } from '@/lib/reports/expected-cash';

/** Open-shift expected cash. No open shift is 0, never a stale closed shift. */
export async function resolveReadinessExpectedCashPence(input: {
  openShiftExpectedCashPence?: number[];
  openShifts?: Array<{ entries: ExpectedCashEntry[] }>;
}) {
  if (input.openShifts) {
    if (input.openShifts.length === 0) return 0;
    return input.openShifts.reduce(
      (sum, shift) => sum + expectedCashPenceFromEntries(shift.entries),
      0,
    );
  }
  const values = input.openShiftExpectedCashPence ?? [];
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0);
}
