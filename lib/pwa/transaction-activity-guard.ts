/**
 * Prevents service-worker activation reloads (and similar full-page resets)
 * from interrupting an active POS cart or in-flight / uncertain sale.
 *
 * Login uses a bounded deferral (see login-submit-guard). POS stays deferred
 * until the transaction is inactive — a mid-sale hard reload would regenerate
 * saleAttemptId and risk a duplicate submission after an uncertain outcome.
 *
 * `data-pos-txn-active` is only a cross-component signal for PullToRefresh /
 * ServiceWorkerRegistration. Cart and saleAttemptId remain owned by PosClient.
 */

declare global {
  interface Window {
    __tillflowPosTxnActive?: boolean;
  }
}

let pendingReload: (() => void) | null = null;
const POS_TXN_ATTR = 'data-pos-txn-active';

export type NotifyPosTransactionOptions = {
  /** When false, clear the active flag without flushing a deferred SW reload (unmount). */
  flushOnInactive?: boolean;
};

export function isPosTransactionActive(): boolean {
  if (typeof window === 'undefined') return false;
  return window.__tillflowPosTxnActive === true;
}

export function notifyPosTransactionActive(
  active: boolean,
  options: NotifyPosTransactionOptions = {},
) {
  if (typeof window === 'undefined') return;
  const flushOnInactive = options.flushOnInactive !== false;
  window.__tillflowPosTxnActive = active;
  try {
    if (active) {
      document.documentElement.setAttribute(POS_TXN_ATTR, 'true');
      return;
    }
    document.documentElement.removeAttribute(POS_TXN_ATTR);
    if (flushOnInactive) {
      flushPendingPosServiceWorkerReload();
    }
  } catch {
    if (!active && flushOnInactive) flushPendingPosServiceWorkerReload();
  }
}

export function deferPosServiceWorkerReload(reload: () => void) {
  // Collapse repeated controllerchange events to a single pending reload.
  pendingReload = reload;
}

export function flushPendingPosServiceWorkerReload() {
  if (isPosTransactionActive()) return;
  if (!pendingReload) return;
  const reload = pendingReload;
  pendingReload = null;
  reload();
}

export function resetPosTransactionGuardForTests() {
  pendingReload = null;
  if (typeof window !== 'undefined') {
    window.__tillflowPosTxnActive = false;
    try {
      document.documentElement.removeAttribute(POS_TXN_ATTR);
    } catch {
      // ignore
    }
  }
}

export const POS_TXN_ACTIVE_ATTR = POS_TXN_ATTR;
