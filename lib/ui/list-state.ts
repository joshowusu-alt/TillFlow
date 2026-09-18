/**
 * Persist list navigation state in sessionStorage, keyed by route.
 *
 * Agent 0: apply `useListState` (`lib/ui/use-list-state.ts`) on supplier,
 * expense, purchase, stocktake, and shift lists the same way Products and
 * Labels do. Do not persist secrets.
 *
 * Stored keys: q, filters, page, tab, scrollY, extra (e.g. selected ids).
 */

export const LIST_STATE_PREFIX = 'tillflow:list-state:';

export type ListStateSnapshot = {
  q?: string;
  filters?: Record<string, string | undefined>;
  page?: number;
  tab?: string;
  scrollY?: number;
  extra?: Record<string, unknown>;
};

export function listStateKey(route: string): string {
  const normalized = route.startsWith('/') ? route : `/${route}`;
  return `${LIST_STATE_PREFIX}${normalized}`;
}

export function readListState(route: string): ListStateSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(listStateKey(route));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ListStateSnapshot;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeListState(route: string, state: ListStateSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(listStateKey(route), JSON.stringify(state));
  } catch {
    // Quota or private mode — list UX still works without persistence.
  }
}

export function clearListState(route: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(listStateKey(route));
}

export function isBareListState(
  state: Pick<ListStateSnapshot, 'q' | 'page' | 'tab' | 'filters'>,
  defaults: { q?: string; page?: number; tab?: string } = {},
): boolean {
  const defaultQ = defaults.q ?? '';
  const defaultPage = defaults.page ?? 1;
  const defaultTab = defaults.tab;
  const q = (state.q ?? '').trim();
  const page = state.page ?? 1;
  const tab = state.tab;
  const filterValues = Object.values(state.filters ?? {}).filter((value) => Boolean(value?.trim()));
  if (q !== defaultQ) return false;
  if (page !== defaultPage) return false;
  if (defaultTab != null && tab && tab !== defaultTab) return false;
  if (filterValues.length > 0) return false;
  return true;
}

export function buildListHref(route: string, state: ListStateSnapshot): string {
  const params = new URLSearchParams();
  if (state.q?.trim()) params.set('q', state.q.trim());
  if (state.tab) params.set('tab', state.tab);
  if (state.page && state.page > 1) params.set('page', String(state.page));
  for (const [key, value] of Object.entries(state.filters ?? {})) {
    if (value?.trim()) params.set(key, value.trim());
  }
  const qs = params.toString();
  return qs ? `${route}?${qs}` : route;
}

export function restoreListScroll(route: string): void {
  const stored = readListState(route);
  if (stored?.scrollY == null || typeof window === 'undefined') return;
  const top = stored.scrollY;
  window.requestAnimationFrame(() => {
    window.scrollTo({ top, left: 0, behavior: 'auto' });
  });
}
