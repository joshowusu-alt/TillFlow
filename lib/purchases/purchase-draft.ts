export const PURCHASE_DRAFT_VERSION = 1;

export function getPurchaseDraftStorageKey(storeId: string) {
  return `tillflow:purchase-draft:${storeId}`;
}

export function clearPurchaseDraft(storeId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(getPurchaseDraftStorageKey(storeId));
  } catch {
    // Ignore storage failures in private mode or quota errors.
  }
}
