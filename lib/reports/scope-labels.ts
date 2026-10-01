/**
 * Customer-facing scope names shared by report pages and the entitlement types.
 * The entitlement module re-exports these so a presentation file does not import it.
 */
export const CONSOLIDATED_LABEL = 'Consolidated — all branches';

export function reportScopeLabel(
  selected: string,
  stores: ReadonlyArray<{ id: string; name: string }>,
): string {
  if (selected === 'ALL') return CONSOLIDATED_LABEL;
  const match = stores.find((store) => store.id === selected);
  return match?.name ?? 'This branch';
}
