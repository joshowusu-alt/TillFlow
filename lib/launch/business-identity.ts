/**
 * Tenant-safe launch personalisation for the installed PWA.
 * Stores only a display business name (+ opaque scope token). Never stores
 * emails, user names, amounts, or raw business IDs in launch copy state.
 */

export const LAUNCH_BUSINESS_NAME_KEY = 'tillflow:lastBusinessName';
export const LAUNCH_BUSINESS_SCOPE_KEY = 'tillflow:lastBusinessScope';

export const LAUNCH_GENERIC_MESSAGE = 'Opening your business...';
export const LAUNCH_GENERIC_DETAIL = 'Checking your session and sync status';
export const LAUNCH_PERSONAL_DETAIL = "Getting today's sales, stock, and cash ready.";

export type LaunchCopy = {
  message: string;
  detail: string;
  personalized: boolean;
  businessName: string | null;
};

function canUseStorage() {
  return typeof window !== 'undefined';
}

/** Opaque non-reversible scope token — not a readable business id. */
export function createLaunchBusinessScope(businessId: string): string {
  const input = `tillflow-launch:${businessId.trim()}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `s${(hash >>> 0).toString(36)}`;
}

export function readLaunchBusinessName(): string | null {
  if (!canUseStorage()) return null;
  try {
    const name = window.localStorage.getItem(LAUNCH_BUSINESS_NAME_KEY)?.trim() || null;
    return name || null;
  } catch {
    return null;
  }
}

export function readLaunchBusinessScope(): string | null {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(LAUNCH_BUSINESS_SCOPE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function getLaunchCopy(businessName?: string | null): LaunchCopy {
  const clean = businessName?.trim() || readLaunchBusinessName();
  if (!clean) {
    return {
      message: LAUNCH_GENERIC_MESSAGE,
      detail: LAUNCH_GENERIC_DETAIL,
      personalized: false,
      businessName: null,
    };
  }
  return {
    message: `Opening ${clean}...`,
    detail: LAUNCH_PERSONAL_DETAIL,
    personalized: true,
    businessName: clean,
  };
}

export function saveLaunchBusinessIdentity(name: string, businessId: string) {
  if (!canUseStorage()) return;
  const cleanName = name.trim();
  const cleanId = businessId.trim();
  if (!cleanName || !cleanId) return;

  const nextScope = createLaunchBusinessScope(cleanId);
  try {
    const previousScope = window.localStorage.getItem(LAUNCH_BUSINESS_SCOPE_KEY);
    if (previousScope && previousScope !== nextScope) {
      window.localStorage.removeItem(LAUNCH_BUSINESS_NAME_KEY);
    }
    window.localStorage.setItem(LAUNCH_BUSINESS_NAME_KEY, cleanName);
    window.localStorage.setItem(LAUNCH_BUSINESS_SCOPE_KEY, nextScope);
  } catch {
    // Private mode / quota — personalisation fails closed to generic copy.
  }
}

export function clearLaunchBusinessIdentity() {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(LAUNCH_BUSINESS_NAME_KEY);
    window.localStorage.removeItem(LAUNCH_BUSINESS_SCOPE_KEY);
  } catch {
    // Ignore storage failures; next read still fails safely to generic copy.
  }
}

/**
 * When an authenticated business loads, keep cache aligned. If the opaque
 * scope no longer matches, replace identity so a prior tenant cannot linger.
 */
export function syncLaunchBusinessIdentity(name: string, businessId: string) {
  if (!canUseStorage()) return;
  const cleanName = name.trim();
  const cleanId = businessId.trim();
  if (!cleanName || !cleanId) {
    clearLaunchBusinessIdentity();
    return;
  }

  const expectedScope = createLaunchBusinessScope(cleanId);
  const currentScope = readLaunchBusinessScope();
  const currentName = readLaunchBusinessName();

  if (currentScope && currentScope !== expectedScope) {
    clearLaunchBusinessIdentity();
  }

  if (currentName !== cleanName || currentScope !== expectedScope) {
    saveLaunchBusinessIdentity(cleanName, cleanId);
  }
}
