export function getMoneyOperationKeyStorageKey(scope: string) {
  return `tillflow:money-op-key:${scope}`;
}

export type StoredMoneyOperationKey = {
  key: string;
  /** Submitted, and the response has not been confirmed. */
  consumed: boolean;
  /** A success page for this intention has been observed. The next read mints. */
  settled: boolean;
  /** `?pay=` value already applied to this key. A refresh of that same success reuses it. */
  mintedForPay: string | null;
};

function parseStored(raw: string | null): StoredMoneyOperationKey | null {
  const value = raw?.trim();
  if (!value) return null;
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as {
        key?: string;
        consumed?: boolean;
        settled?: boolean;
        mintedForPay?: string | null;
      };
      const key = parsed.key?.trim();
      if (!key) return null;
      // Older builds stored `{ key, consumed }` and treated consumed as retired.
      // Only an explicit settled:false is an in-flight retry that must keep its key.
      const settled = typeof parsed.settled === 'boolean' ? parsed.settled : Boolean(parsed.consumed);
      return {
        key,
        consumed: Boolean(parsed.consumed) || settled,
        settled,
        mintedForPay: typeof parsed.mintedForPay === 'string' && parsed.mintedForPay.trim() ? parsed.mintedForPay : null,
      };
    } catch {
      return null;
    }
  }
  // Older builds stored the bare key. Treat it as an open intention.
  return { key: value, consumed: false, settled: false, mintedForPay: null };
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
 * Reuse the key until a success page settles it.
 * An in-flight retry (refresh while the first response is still unresolved) must
 * submit the same key so the server collapses it. A settled intention mints the
 * next one, stamped with the success token that produced it.
 */
export function readOrCreateMoneyOperationKey(scope: string, fallback?: string, mintedForPay?: string | null) {
  const next = fallback?.trim() || crypto.randomUUID();
  if (typeof window === 'undefined') return next;
  try {
    const existing = readStoredMoneyOperationKey(scope);
    if (existing && !existing.settled) return existing.key;
    writeStored(scope, {
      key: next,
      consumed: false,
      settled: false,
      mintedForPay: mintedForPay?.trim() || null,
    });
    return next;
  } catch {
    return next;
  }
}

/** Mark the intention in flight. The hidden input keeps this key, and so does a remount. */
export function consumeMoneyOperationKey(scope: string) {
  if (typeof window === 'undefined') return;
  try {
    const existing = readStoredMoneyOperationKey(scope);
    if (!existing || existing.settled) return;
    writeStored(scope, { ...existing, consumed: true, settled: false });
  } catch {
    // Ignore storage failures in private mode.
  }
}

/**
 * The response was confirmed (`?paid=` / `?pay=` / `?recorded=1`).
 * A refresh of the same `?pay=` does not retire the key minted for that success,
 * so a retry that is still unresolved keeps the in-flight key.
 */
export function settleMoneyOperationKey(scope: string, payNonce?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    const existing = readStoredMoneyOperationKey(scope);
    if (!existing || existing.settled) return;
    const pay = payNonce?.trim() || null;
    if (pay && existing.mintedForPay === pay) return;
    if (!pay && !existing.consumed) return;
    writeStored(scope, { ...existing, consumed: true, settled: true });
  } catch {
    // Ignore storage failures in private mode.
  }
}

/** Success pages that do not mount the payment form still retire that record's in-flight keys. */
export function consumeMoneyOperationKeysForRecord(recordId: string, payNonce?: string | null) {
  if (typeof window === 'undefined') return;
  const id = recordId.trim();
  if (!id) return;
  try {
    const prefix = 'tillflow:money-op-key:';
    for (const storageKey of Object.keys(window.sessionStorage)) {
      if (!storageKey.startsWith(prefix)) continue;
      const scope = storageKey.slice(prefix.length);
      if (scope.endsWith(`:${id}`)) settleMoneyOperationKey(scope, payNonce);
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
