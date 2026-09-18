export const OPERATIONAL_STORE_COOKIE = 'tillflow_operational_store';

export const MISSING_OPERATIONAL_STORE_MSG =
  'Select a branch in the header before recording this transaction.';

export const INACTIVE_OPERATIONAL_STORE_MSG =
  'The saved branch is no longer available. Select a branch in the header.';

export const FOREIGN_OPERATIONAL_STORE_MSG =
  'That branch is not available for your business.';

export const ALL_BRANCHES_NOT_OPERATIONAL_MSG =
  'All branches is only valid for reports. Select one branch to record a transaction.';

export const OPERATIONAL_STORE_MISMATCH_MSG =
  'The selected branch does not match the store on this record, till, or form.';

export const STALE_OPERATIONAL_STORE_MSG =
  'This tab is out of date. Another tab changed the active branch. Reload before recording anything.';

export const OPERATIONAL_ROUTE_PREFIXES = [
  '/pos',
  '/shifts',
  '/expenses',
  '/purchases',
  '/inventory',
  '/payments/supplier-payments',
  '/payments/customer-receipts',
  '/transfers',
  '/customers',
] as const;

export type OperationalStoreChoice = {
  id: string;
  name: string;
  address?: string | null;
  businessId?: string;
  active?: boolean;
};

export type OperationalStoreReason =
  | 'cookie'
  | 'sole'
  | 'url-match'
  | 'unselected'
  | 'inactive-cleared'
  | 'foreign-rejected';

export type OperationalStoreResolution = {
  store: OperationalStoreChoice | null;
  reason: OperationalStoreReason;
  cookieStoreId: string | null;
  urlStoreId: string | null;
  conflict: { urlStoreId: string; operationalStoreId: string; urlStoreName: string } | null;
  error: string | null;
  shouldClearCookie: boolean;
};

function isActiveStore(store: OperationalStoreChoice) {
  return store.active !== false;
}

export function isOperationalRoute(pathname: string | null | undefined): boolean {
  const path = pathname?.split('?')[0] ?? '';
  return OPERATIONAL_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function withOperationalStoreQuery(path: string, storeId: string | null | undefined): string {
  if (!isOperationalRoute(path.split('?')[0] ?? '')) return path;
  const trimmed = storeId?.trim() ?? '';
  if (!trimmed) return path;
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('storeId', trimmed);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * One authoritative operational store.
 *
 * Cookie is the header switcher. A matching URL storeId is accepted.
 * A foreign URL storeId fails closed. A mismatched authorised URL is a
 * conflict — the cookie store remains authoritative until the owner
 * switches in the header.
 *
 * Never selects stores[0] among many. Never accepts ALL for mutations.
 */
export function resolveOperationalStore(input: {
  stores: OperationalStoreChoice[];
  cookieStoreId?: string | null;
  urlStoreId?: string | null;
}): OperationalStoreResolution {
  const authorised = input.stores.filter((store) => store.id);
  const cookieStoreId = input.cookieStoreId?.trim() || null;
  const rawUrl = input.urlStoreId?.trim() || null;
  const urlStoreId = !rawUrl || rawUrl === 'ALL' ? null : rawUrl;
  const urlIsAll = rawUrl === 'ALL';

  const byId = new Map(authorised.map((store) => [store.id, store]));
  const activeStores = authorised.filter(isActiveStore);

  if (urlIsAll && !urlStoreId) {
    // ALL is ignored for operational resolution; cookie/sole still apply.
  }

  if (rawUrl && rawUrl !== 'ALL' && !byId.has(rawUrl)) {
    return {
      store: null,
      reason: 'foreign-rejected',
      cookieStoreId,
      urlStoreId: rawUrl,
      conflict: null,
      error: FOREIGN_OPERATIONAL_STORE_MSG,
      shouldClearCookie: false,
    };
  }

  const cookieStore = cookieStoreId ? byId.get(cookieStoreId) ?? null : null;
  if (cookieStoreId && (!cookieStore || !isActiveStore(cookieStore))) {
    const sole = activeStores.length === 1 ? activeStores[0] : null;
    return {
      store: sole,
      reason: sole ? 'sole' : 'inactive-cleared',
      cookieStoreId,
      urlStoreId,
      conflict: null,
      error: sole ? null : INACTIVE_OPERATIONAL_STORE_MSG,
      shouldClearCookie: true,
    };
  }

  if (cookieStore && isActiveStore(cookieStore)) {
    const urlStore = urlStoreId ? byId.get(urlStoreId) ?? null : null;
    const conflict =
      urlStore && urlStore.id !== cookieStore.id
        ? {
            urlStoreId: urlStore.id,
            operationalStoreId: cookieStore.id,
            urlStoreName: urlStore.name,
          }
        : null;
    return {
      store: cookieStore,
      reason: urlStore && urlStore.id === cookieStore.id ? 'url-match' : 'cookie',
      cookieStoreId,
      urlStoreId,
      conflict,
      error: null,
      shouldClearCookie: false,
    };
  }

  if (activeStores.length === 1) {
    const sole = activeStores[0];
    const urlStore = urlStoreId ? byId.get(urlStoreId) ?? null : null;
    if (urlStore && urlStore.id !== sole.id) {
      return {
        store: sole,
        reason: 'sole',
        cookieStoreId,
        urlStoreId,
        conflict: {
          urlStoreId: urlStore.id,
          operationalStoreId: sole.id,
          urlStoreName: urlStore.name,
        },
        error: null,
        shouldClearCookie: false,
      };
    }
    return {
      store: sole,
      reason: urlStore?.id === sole.id ? 'url-match' : 'sole',
      cookieStoreId,
      urlStoreId,
      conflict: null,
      error: null,
      shouldClearCookie: false,
    };
  }

  return {
    store: null,
    reason: 'unselected',
    cookieStoreId,
    urlStoreId,
    conflict: null,
    error: activeStores.length > 1 ? MISSING_OPERATIONAL_STORE_MSG : null,
    shouldClearCookie: false,
  };
}

/**
 * Two-tab contract: the operational-store cookie is shared across tabs.
 * The last successful header switch wins. A tab whose URL names a different
 * authorised store shows a conflict and keeps posting to the cookie store
 * until the owner switches in the header. Mutations always re-validate the
 * submitted store, till, and source record server-side.
 */
export const MULTI_TAB_OPERATIONAL_STORE_CONTRACT =
  'shared-cookie-last-write-wins-with-stale-tab-block-and-server-mismatch-reject';
