/**
 * Close-shift cash handover.
 *
 * Counted cash is physical. The opening float can only be retained when it is
 * actually in the drawer. Never advertise a full float retain when counted
 * cash is below the opening float.
 */
export type CashHandoverInput = {
  expectedCashPence: number;
  actualCashPence: number | null;
  openingFloatPence: number;
};

export type CashHandoverBreakdown = {
  expectedCashPence: number;
  actualCashPence: number | null;
  variancePence: number | null;
  openingFloatPence: number;
  retainedPence: number | null;
  handedOverPence: number | null;
  floatShortfallPence: number | null;
  canRetainFullFloat: boolean;
  isEstimate: boolean;
};

export function computeCashHandover(input: CashHandoverInput): CashHandoverBreakdown {
  const expectedCashPence = Number.isFinite(input.expectedCashPence) ? Math.round(input.expectedCashPence) : 0;
  const openingFloatPence = Math.max(
    0,
    Number.isFinite(input.openingFloatPence) ? Math.round(input.openingFloatPence) : 0,
  );
  const actual = input.actualCashPence;
  const hasActual = actual !== null && actual !== undefined && Number.isFinite(actual);

  if (!hasActual) {
    return {
      expectedCashPence,
      actualCashPence: null,
      variancePence: null,
      openingFloatPence,
      retainedPence: null,
      handedOverPence: null,
      floatShortfallPence: null,
      canRetainFullFloat: false,
      isEstimate: true,
    };
  }

  const actualCashPence = Math.round(actual);
  const variancePence = actualCashPence - expectedCashPence;
  if (actualCashPence >= openingFloatPence) {
    return {
      expectedCashPence,
      actualCashPence,
      variancePence,
      openingFloatPence,
      retainedPence: openingFloatPence,
      handedOverPence: actualCashPence - openingFloatPence,
      floatShortfallPence: 0,
      canRetainFullFloat: true,
      isEstimate: false,
    };
  }

  return {
    expectedCashPence,
    actualCashPence,
    variancePence,
    openingFloatPence,
    retainedPence: Math.max(0, actualCashPence),
    handedOverPence: 0,
    floatShortfallPence: openingFloatPence - Math.max(0, actualCashPence),
    canRetainFullFloat: false,
    isEstimate: false,
  };
}
