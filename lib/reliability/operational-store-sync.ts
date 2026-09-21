export const OPERATIONAL_STORE_CHANNEL = 'tillflow-operational-store';
export const OPERATIONAL_STORE_SIGNAL_KEY = 'tillflow_operational_store_signal';
export const OPERATIONAL_STORE_TAB_KEY = 'tillflow_operational_store_tab';

export type OperationalStoreSignal = {
  id: string;
  name: string;
  ts: number;
  /** Tab that published the signal; that tab never treats its own switch as "another tab". */
  tabId?: string;
};

/** Broadcast payload that clears the signal (a failed switch from a tab that had no branch yet). */
export type OperationalStoreSignalClear = { id: ''; name: ''; ts: number; tabId?: string; cleared: true };

function randomTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Stable per-tab identity (sessionStorage is per tab and survives reloads).
 * Returns null on the server or when storage is unavailable.
 */
export function getOperationalStoreTabId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.sessionStorage.getItem(OPERATIONAL_STORE_TAB_KEY);
    if (existing) return existing;
    const created = randomTabId();
    window.sessionStorage.setItem(OPERATIONAL_STORE_TAB_KEY, created);
    return created;
  } catch {
    return null;
  }
}

export function parseOperationalStoreSignal(raw: string | null | undefined): OperationalStoreSignal | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OperationalStoreSignal>;
    if (!parsed.id || !parsed.name) return null;
    return {
      id: String(parsed.id),
      name: String(parsed.name),
      ts: Number(parsed.ts) || 0,
      ...(parsed.tabId ? { tabId: String(parsed.tabId) } : {}),
    };
  } catch {
    return null;
  }
}

/** Normalise a BroadcastChannel payload: a clear message becomes null. */
export function signalFromBroadcast(data: unknown): OperationalStoreSignal | null {
  if (!data || typeof data !== 'object') return null;
  const candidate = data as Partial<OperationalStoreSignal> & { cleared?: boolean };
  if (candidate.cleared || !candidate.id || !candidate.name) return null;
  return {
    id: String(candidate.id),
    name: String(candidate.name),
    ts: Number(candidate.ts) || 0,
    ...(candidate.tabId ? { tabId: String(candidate.tabId) } : {}),
  };
}

function broadcast(payload: OperationalStoreSignal | OperationalStoreSignalClear) {
  try {
    const channel = new BroadcastChannel(OPERATIONAL_STORE_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {
    // BroadcastChannel unavailable — the storage event still reaches other tabs.
  }
}

/** Announce the branch this tab intends to make active (published before the switch is authoritative). */
export function publishOperationalStoreSignal(store: { id: string; name: string }) {
  if (typeof window === 'undefined') return;
  const payload: OperationalStoreSignal = {
    id: store.id,
    name: store.name,
    ts: Date.now(),
    ...(getOperationalStoreTabId() ? { tabId: getOperationalStoreTabId() as string } : {}),
  };
  window.localStorage.setItem(OPERATIONAL_STORE_SIGNAL_KEY, JSON.stringify(payload));
  broadcast(payload);
}

/**
 * A switch failed: the cookie still holds the previous branch, so tell every
 * tab that the previous branch is (still) the active one. With no previous
 * branch the signal is cleared, so no tab is left believing a switch happened.
 */
export function revertOperationalStoreSignal(previous: { id: string; name: string } | null | undefined) {
  if (typeof window === 'undefined') return;
  if (previous?.id) {
    publishOperationalStoreSignal({ id: previous.id, name: previous.name || previous.id });
    return;
  }
  window.localStorage.removeItem(OPERATIONAL_STORE_SIGNAL_KEY);
  const tabId = getOperationalStoreTabId();
  broadcast({ id: '', name: '', ts: Date.now(), cleared: true, ...(tabId ? { tabId } : {}) });
}

/**
 * A tab is stale when another tab has switched the operational branch away
 * from the branch this tab was rendered with.
 *
 * A tab rendered with NO branch (empty operational-store cookie) is also stale
 * once any other tab selects a branch after this tab loaded — otherwise an
 * empty-cookie tab could keep interacting as if no switch had happened. A
 * signal older than the tab's own load (for example a leftover value from a
 * previous session) is not stale, so login never traps itself.
 *
 * A tab's own switch is never "another tab": while its switch is pending the
 * switcher dialog already blocks it, and once the switch lands its branch
 * equals the signal anyway.
 */
export function isStaleOperationalStore(
  tabStoreId: string | null | undefined,
  signal: OperationalStoreSignal | null,
  tabLoadedAt?: number,
  tabId?: string | null,
): boolean {
  if (!signal?.id) return false;
  if (tabId && signal.tabId && signal.tabId === tabId) return false;
  if (!tabStoreId) {
    return typeof tabLoadedAt === 'number' && signal.ts > tabLoadedAt;
  }
  return signal.id !== tabStoreId;
}
