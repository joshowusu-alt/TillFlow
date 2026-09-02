export function getMoneyOperationKeyStorageKey(scope: string) {
  return `tillflow:money-op-key:${scope}`;
}

/** Reuse the same money identity across retries and remounts. */
export function readOrCreateMoneyOperationKey(scope: string, fallback?: string) {
  const next = fallback?.trim() || crypto.randomUUID();
  if (typeof window === 'undefined') return next;
  try {
    const storageKey = getMoneyOperationKeyStorageKey(scope);
    const existing = window.sessionStorage.getItem(storageKey)?.trim();
    if (existing) return existing;
    window.sessionStorage.setItem(storageKey, next);
    return next;
  } catch {
    return next;
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
