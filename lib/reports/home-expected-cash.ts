/** Shared Expected Cash semantics for Home / readiness (open-shift sum only). */
export async function resolveReadinessExpectedCashPence(input: {
  openShiftExpectedCashPence: number[];
}) {
  if (input.openShiftExpectedCashPence.length > 0) {
    return input.openShiftExpectedCashPence.reduce((sum, value) => sum + value, 0);
  }
  return 0;
}
