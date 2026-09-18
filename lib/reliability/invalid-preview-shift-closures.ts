/**
 * Known invalid Preview closes. Display-only. Never rewrite or delete the row.
 */
export const INVALID_PREVIEW_SHIFT_CLOSURES: Record<string, string> = {
  'SHC-000007':
    'Invalid legacy Preview test data. This close recorded actual cash of GH₵-2.50. Do not treat it as a valid closing or include it in reconciliation acceptance totals.',
};

export function invalidPreviewShiftClosureNote(closureNumber?: string | null): string | null {
  const key = closureNumber?.trim() ?? '';
  return key ? INVALID_PREVIEW_SHIFT_CLOSURES[key] ?? null : null;
}
