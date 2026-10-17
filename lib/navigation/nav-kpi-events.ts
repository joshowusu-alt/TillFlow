/** Fired after POS checkout completes so header/nav KPI totals can refresh immediately. */
export const NAV_KPI_REFRESH_EVENT = 'tillflow:nav-kpi-refresh';

/**
 * Fired after a successful POS sale so the setup banner hides immediately.
 * A layout refresh can be dropped on the client; this event is what the cashier sees.
 */
export const SETUP_BANNER_DISMISS_EVENT = 'tillflow:setup-banner-dismiss';

const setupBannerDismissStorageKey = (businessId: string) =>
  `tillflow:setup-banner-dismissed:${businessId}`;

export function dispatchSetupBannerDismiss(businessId: string) {
  if (typeof window === 'undefined' || !businessId) return;
  try {
    window.sessionStorage.setItem(setupBannerDismissStorageKey(businessId), '1');
  } catch {
    // Private mode can reject sessionStorage; the event still hides the current banner.
  }
  window.dispatchEvent(
    new CustomEvent<{ businessId: string }>(SETUP_BANNER_DISMISS_EVENT, {
      detail: { businessId },
    }),
  );
}

export function isSetupBannerDismissed(businessId: string) {
  if (typeof window === 'undefined' || !businessId) return false;
  try {
    return window.sessionStorage.getItem(setupBannerDismissStorageKey(businessId)) === '1';
  } catch {
    return false;
  }
}

export type NavKpiRefreshDetail = {
  force?: boolean;
};

export function dispatchNavKpiRefresh(detail: NavKpiRefreshDetail = { force: true }) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<NavKpiRefreshDetail>(NAV_KPI_REFRESH_EVENT, { detail }));
}
