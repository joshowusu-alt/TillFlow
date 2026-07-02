/** Max time to defer a service-worker reload while login is in flight. */
export const LOGIN_SW_RELOAD_MAX_DEFER_MS = 15_000;

declare global {
  interface Window {
    __tillflowLoginSubmitting?: boolean;
  }
}

let pendingReload: (() => void) | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

export function isLoginSubmitting(): boolean {
  if (typeof window === 'undefined') return false;
  return window.__tillflowLoginSubmitting === true;
}

export function notifyLoginSubmitting(active: boolean) {
  if (typeof window === 'undefined') return;
  window.__tillflowLoginSubmitting = active;
  if (!active) {
    flushPendingServiceWorkerReload();
  }
}

export function deferServiceWorkerReload(reload: () => void) {
  pendingReload = reload;
  if (fallbackTimer) clearTimeout(fallbackTimer);
  fallbackTimer = setTimeout(() => {
    flushPendingServiceWorkerReload();
  }, LOGIN_SW_RELOAD_MAX_DEFER_MS);
}

export function flushPendingServiceWorkerReload() {
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  if (!pendingReload) return;
  const reload = pendingReload;
  pendingReload = null;
  reload();
}

export function resetLoginSubmitGuardForTests() {
  pendingReload = null;
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  if (typeof window !== 'undefined') {
    window.__tillflowLoginSubmitting = false;
  }
}
