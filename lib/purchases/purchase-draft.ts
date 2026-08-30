export const PURCHASE_DRAFT_VERSION = 1;

export function getPurchaseDraftStorageKey(storeId: string) {
  return `tillflow:purchase-draft:${storeId}`;
}

export function getPurchaseOperationKeyStorageKey(storeId: string) {
  return `tillflow:purchase-op-key:${storeId}`;
}

/** Reuse the same paid-purchase identity across retries and remounts. */
export function readOrCreatePurchaseOperationKey(storeId: string, fallback?: string) {
  const next = fallback?.trim() || crypto.randomUUID();
  if (typeof window === 'undefined') return next;
  try {
    const storageKey = getPurchaseOperationKeyStorageKey(storeId);
    const existing = window.sessionStorage.getItem(storageKey)?.trim();
    if (existing) return existing;
    window.sessionStorage.setItem(storageKey, next);
    return next;
  } catch {
    return next;
  }
}

export function clearPurchaseOperationKey(storeId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(getPurchaseOperationKeyStorageKey(storeId));
  } catch {
    // Ignore storage failures in private mode.
  }
}

export function clearPurchaseDraft(storeId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(getPurchaseDraftStorageKey(storeId));
  } catch {
    // Ignore storage failures in private mode or quota errors.
  }
}
