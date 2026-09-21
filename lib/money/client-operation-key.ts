export function getMoneyOperationKeyStorageKey(scope: string) {
  return `tillflow:money-op-key:${scope}`;
}

export type StoredMoneyOperationKey = { key: string; consumed: boolean };

function parseStored(raw: string | null): StoredMoneyOperationKey | null {
  const value = raw?.trim();
  if (!value) return null;
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as { key?: string; consumed?: boolean };
      const key = parsed.key?.trim();
      if (!key) return null;
      return { key, consumed: Boolean(parsed.consumed) };
    } catch {
      return null;
    }
  }
  // Older builds stored the bare key. Treat it as an open intention.
  return { key: value, consumed: false };
}

export function readStoredMoneyOperationKey(scope: string): StoredMoneyOperationKey | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseStored(window.sessionStorage.getItem(getMoneyOperationKeyStorageKey(scope)));
  } catch {
    return null;
  }
}

function writeStored(scope: string, stored: StoredMoneyOperationKey) {
  window.sessionStorage.setItem(getMoneyOperationKeyStorageKey(scope), JSON.stringify(stored));
}

/**
 * Reuse the open intention across a remount (strict mode, refresh before submit).
 * A consumed intention — one that was already submitted — mints a new key.
 */
export function readOrCreateMoneyOperationKey(scope: string, fallback?: string) {
  const next = fallback?.trim() || crypto.randomUUID();
  if (typeof window === 'undefined') return next;
  try {
    const existing = readStoredMoneyOperationKey(scope);
    if (existing && !existing.consumed) return existing.key;
    writeStored(scope, { key: next, consumed: false });
    return next;
  } catch {
    return next;
  }
}

/** The in-flight form keeps this key; the next mount of the same scope gets a new one. */
export function consumeMoneyOperationKey(scope: string) {
  if (typeof window === 'undefined') return;
  try {
    const existing = readStoredMoneyOperationKey(scope);
    if (!existing) return;
    writeStored(scope, { key: existing.key, consumed: true });
  } catch {
    // Ignore storage failures in private mode.
  }
}

/** Success pages that do not mount the payment form still retire that record's open keys. */
export function consumeMoneyOperationKeysForRecord(recordId: string) {
  if (typeof window === 'undefined') return;
  const id = recordId.trim();
  if (!id) return;
  try {
    const prefix = 'tillflow:money-op-key:';
    for (const storageKey of Object.keys(window.sessionStorage)) {
      if (!storageKey.startsWith(prefix)) continue;
      const scope = storageKey.slice(prefix.length);
      if (scope.endsWith(`:${id}`)) consumeMoneyOperationKey(scope);
    }
  } catch {
    // Ignore storage failures in private mode.
  }
}

export function clearMoneyOperationKey(scope: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(getMoneyOperationKeyStorageKey(scope));
  } catch {
    // Ignore storage failures in private mode.
  }
}
