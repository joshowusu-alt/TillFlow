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

export function isStaleOperationalStore(
  tabStoreId: string | null | undefined,
  signal: OperationalStoreSignal | null,
): boolean {
  if (!tabStoreId || !signal?.id) return false;
  return signal.id !== tabStoreId;
}
