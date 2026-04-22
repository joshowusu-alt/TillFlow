export const SESSION_COOKIE_PREFIX = 'pos_session_';
export const ACTIVE_BUSINESS_COOKIE = 'pos_active_business';

export function getBusinessSessionCookieName(businessId: string) {
  return `${SESSION_COOKIE_PREFIX}${businessId}`;
}

export function extractBusinessIdFromSessionCookie(cookieName: string): string | null {
  if (!cookieName.startsWith(SESSION_COOKIE_PREFIX)) return null;
  const businessId = cookieName.slice(SESSION_COOKIE_PREFIX.length).trim();
  return businessId || null;
}

export function buildScopedStorageKey(
  baseKey: string,
  scope: { businessId: string; storeId?: string | null }
) {
  const parts = [baseKey, scope.businessId];
  if (scope.storeId) {
    parts.push(scope.storeId);
  }
  return parts.join('.');
}

export function getPosCartStorageKey(scope: { businessId: string; storeId: string }) {
  return buildScopedStorageKey('pos.savedCart', scope);
}

export function getPosCustomerStorageKey(scope: { businessId: string; storeId: string }) {
  return buildScopedStorageKey('pos.savedCustomer', scope);
}

export function getParkedCartsStorageKey(scope: { businessId: string; storeId: string }) {
  return buildScopedStorageKey('pos.parkedCarts', scope);
}

export function getLastReceiptStorageKey(scope: { businessId: string; storeId: string }) {
  return buildScopedStorageKey('pos.lastReceiptId', scope);
}

export function getPosTillStorageKey(scope: { businessId: string; storeId: string }) {
  return buildScopedStorageKey('pos.savedTill', scope);
}

export function getCashDrawerEnabledStorageKey(scope: { businessId: string }) {
  return buildScopedStorageKey('pos.cashDrawerEnabled', scope);
}

export function getOfflineActiveBusinessMetaKey() {
  return 'active-business';
}

export function getOfflineActiveStoreMetaKey() {
  return 'active-store';
}

export function getOfflineCacheUrl(businessId: string, storeId?: string | null) {
  const params = new URLSearchParams({ businessId });
  if (storeId) {
    params.set('storeId', storeId);
  }
  return `/api/offline/cache-data?${params.toString()}`;
}

export function getActiveBusinessIdFromCookieString(cookieString: string): string | null {
  const parts = cookieString.split(';');
  for (const part of parts) {
    const [rawName, ...rawValueParts] = part.trim().split('=');
    if (rawName !== ACTIVE_BUSINESS_COOKIE) continue;
    const value = rawValueParts.join('=').trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

export function getClientActiveBusinessId(): string | null {
  if (typeof document === 'undefined') return null;
  return getActiveBusinessIdFromCookieString(document.cookie);
}
