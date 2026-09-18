/**
 * Generic invalid-close detection. Never keyed to a Preview record number.
 * Display-only. Never rewrite or delete the underlying row.
 */
export const INVALID_NEGATIVE_ACTUAL_CASH_NOTE =
  'Invalid close: counted cash is negative. Do not treat this as a valid closing or include it in reconciliation acceptance totals. The original audit evidence is preserved.';

export function isInvalidLegacyClose(actualCashPence: number | null | undefined): boolean {
  return actualCashPence != null && Number.isFinite(actualCashPence) && actualCashPence < 0;
}

export function invalidLegacyCloseNote(actualCashPence: number | null | undefined): string | null {
  return isInvalidLegacyClose(actualCashPence) ? INVALID_NEGATIVE_ACTUAL_CASH_NOTE : null;
}

/** @deprecated Use invalidLegacyCloseNote(actualCashPence). Kept as a typed alias. */
export function invalidPreviewShiftClosureNote(
  _closureNumber?: string | null,
  actualCashPence?: number | null,
): string | null {
  return invalidLegacyCloseNote(actualCashPence);
}
