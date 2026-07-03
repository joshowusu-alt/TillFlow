/** Fired after POS checkout completes so header/nav KPI totals can refresh immediately. */
export const NAV_KPI_REFRESH_EVENT = 'tillflow:nav-kpi-refresh';

export type NavKpiRefreshDetail = {
  force?: boolean;
};

export function dispatchNavKpiRefresh(detail: NavKpiRefreshDetail = { force: true }) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<NavKpiRefreshDetail>(NAV_KPI_REFRESH_EVENT, { detail }));
}
