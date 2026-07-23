'use client';

import { useEffect, useRef } from 'react';

type RefreshRouter = {
  refresh: () => void;
};

const DEFAULT_THROTTLE_MS = 8_000;

/** Named stale threshold — skip resume refresh when SSR data is younger than this. */
export const HOME_RESUME_STALE_MS = 20_000;

/**
 * Refreshes the current App Router tree when the page becomes active again.
 * Used by dashboard surfaces that rely on SSR snapshots (Operations, home).
 *
 * Options:
 * - staleThresholdMs: do not refresh if last refresh/mount was within this window
 * - refreshOnMount: default false — avoids full Home refresh immediately after load
 */
export function useRouterRefreshOnVisibility(
  router: RefreshRouter,
  options?: {
    throttleMs?: number;
    enabled?: boolean;
    staleThresholdMs?: number;
    refreshOnMount?: boolean;
  },
) {
  const lastRefreshAtRef = useRef(0);
  const lastResumeAtRef = useRef(0);
  const mountedAtRef = useRef(0);
  const throttleMs = options?.throttleMs ?? DEFAULT_THROTTLE_MS;
  const staleThresholdMs = options?.staleThresholdMs ?? 0;
  const enabled = options?.enabled ?? true;
  const refreshOnMount = options?.refreshOnMount ?? false;

  useEffect(() => {
    if (!enabled) return;

    mountedAtRef.current = Date.now();
    // Only treat mount as a refresh when a stale window is configured (Owner Home).
    if (!refreshOnMount && staleThresholdMs > 0) {
      lastRefreshAtRef.current = mountedAtRef.current;
    }

    const refresh = (force = false) => {
      const now = Date.now();
      if (!force && now - lastRefreshAtRef.current < throttleMs) return;
      if (!force && staleThresholdMs > 0 && now - lastRefreshAtRef.current < staleThresholdMs) {
        return;
      }
      lastRefreshAtRef.current = now;
      router.refresh();
    };

    /** Deduplicate pageshow + visibilitychange for the same resume burst. */
    const resumeRefresh = (force = false) => {
      const now = Date.now();
      if (now - lastResumeAtRef.current < 400) return;
      lastResumeAtRef.current = now;
      refresh(force);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') resumeRefresh(false);
    };

    const onFocus = () => resumeRefresh(false);

    const onPageShow = (event: PageTransitionEvent) => {
      // bfcache restores always refresh; otherwise respect stale threshold.
      if (event.persisted) {
        resumeRefresh(true);
        return;
      }
      resumeRefresh(false);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [enabled, refreshOnMount, router, staleThresholdMs, throttleMs]);
}
