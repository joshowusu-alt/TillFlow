'use client';

import { useEffect, useRef } from 'react';

type RefreshRouter = {
  refresh: () => void;
};

const DEFAULT_THROTTLE_MS = 8_000;

/**
 * Refreshes the current App Router tree when the page becomes active again.
 * Used by dashboard surfaces that rely on SSR snapshots (Operations, home).
 */
export function useRouterRefreshOnVisibility(
  router: RefreshRouter,
  options?: { throttleMs?: number; enabled?: boolean },
) {
  const lastRefreshAtRef = useRef(0);
  const throttleMs = options?.throttleMs ?? DEFAULT_THROTTLE_MS;
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;

    const refresh = (force = false) => {
      const now = Date.now();
      if (!force && now - lastRefreshAtRef.current < throttleMs) return;
      lastRefreshAtRef.current = now;
      router.refresh();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    const onFocus = () => refresh();

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refresh(true);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [enabled, router, throttleMs]);
}
