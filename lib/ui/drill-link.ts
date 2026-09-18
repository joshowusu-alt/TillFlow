/**
 * Shared drill-down href helper (Agent 0 / Agents 1–4).
 *
 * Remaining balances on money surfaces should use `components/RemainingBalance`
 * plus a link that keeps the current list filters so the owner can return.
 *
 * Agent 5 cannot attach this to supplier/expense/purchase/shift pages.
 * Wire `buildDrillHref` on those lists when you add RemainingBalance.
 */

export type DrillSearchParams = Record<string, string | number | boolean | null | undefined>;

/** Merge a destination path with preserved (and optional extra) query params. */
export function buildDrillHref(
  pathname: string,
  currentSearch: URLSearchParams | DrillSearchParams | string = '',
  extra: DrillSearchParams = {},
): string {
  const params =
    currentSearch instanceof URLSearchParams
      ? new URLSearchParams(currentSearch.toString())
      : typeof currentSearch === 'string'
        ? new URLSearchParams(currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch)
        : new URLSearchParams();

  if (!(currentSearch instanceof URLSearchParams) && typeof currentSearch !== 'string') {
    writeParams(params, currentSearch);
  }
  writeParams(params, extra);

  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function writeParams(params: URLSearchParams, values: DrillSearchParams) {
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === '') {
      params.delete(key);
      continue;
    }
    params.set(key, String(value));
  }
}
