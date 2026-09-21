export const OPERATIONAL_STORE_CHANNEL = 'tillflow-operational-store';
export const OPERATIONAL_STORE_SIGNAL_KEY = 'tillflow_operational_store_signal';

export type OperationalStoreSignal = {
  id: string;
  name: string;
  ts: number;
};

export function parseOperationalStoreSignal(raw: string | null | undefined): OperationalStoreSignal | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OperationalStoreSignal>;
    if (!parsed.id || !parsed.name) return null;
    return { id: String(parsed.id), name: String(parsed.name), ts: Number(parsed.ts) || 0 };
  } catch {
    return null;
  }
}

export function publishOperationalStoreSignal(store: { id: string; name: string }) {
  if (typeof window === 'undefined') return;
  const payload: OperationalStoreSignal = {
    id: store.id,
    name: store.name,
    ts: Date.now(),
  };
  const raw = JSON.stringify(payload);
  window.localStorage.setItem(OPERATIONAL_STORE_SIGNAL_KEY, raw);
  const channel = new BroadcastChannel(OPERATIONAL_STORE_CHANNEL);
  channel.postMessage(payload);
  channel.close();
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
 */
export function isStaleOperationalStore(
  tabStoreId: string | null | undefined,
  signal: OperationalStoreSignal | null,
  tabLoadedAt?: number,
): boolean {
  if (!signal?.id) return false;
  if (!tabStoreId) {
    return typeof tabLoadedAt === 'number' && signal.ts > tabLoadedAt;
  }
  return signal.id !== tabStoreId;
}
