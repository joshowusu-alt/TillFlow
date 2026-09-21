'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  buildListHref,
  isBareListState,
  readListState,
  restoreListScroll,
  writeListState,
  type ListStateSnapshot,
} from './list-state';

export type UseListStateOptions = {
  q?: string;
  page?: number;
  tab?: string;
  filters?: Record<string, string | undefined>;
  extra?: Record<string, unknown>;
  /** When the URL is the route default, replace with the last stored query. */
  restoreOnBareRoute?: boolean;
  bareDefaults?: { q?: string; page?: number; tab?: string };
  persistScroll?: boolean;
};

/**
 * Persist search / filters / page / tab / scroll for a list route.
 * Restores a bare `/route` visit to the last query when `restoreOnBareRoute` is set.
 *
 * Scroll restore rules:
 * - Scroll persistence is paused until the first restore has settled, so the
 *   framework's scroll-to-top on navigation never overwrites the stored offset.
 * - When a bare visit is redirected to the stored query, the restore happens
 *   after that redirect has rendered (the stored `scrollY` belongs to the
 *   filtered list, not the bare one).
 */
export function useListState(route: string, options: UseListStateOptions = {}): ListStateSnapshot {
  const router = useRouter();
  const restoredRef = useRef(false);
  const awaitingRedirectRef = useRef(false);
  const scrollLockedRef = useRef(true);
  const snapshot: ListStateSnapshot = {
    q: options.q,
    page: options.page,
    tab: options.tab,
    filters: options.filters,
    extra: options.extra,
  };

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const stored = readListState(route);
    if (
      options.restoreOnBareRoute &&
      isBareListState(snapshot, options.bareDefaults) &&
      stored &&
      !isBareListState(stored, options.bareDefaults)
    ) {
      // Keep the stored snapshot intact (including scrollY); restore once the
      // redirected query has rendered.
      awaitingRedirectRef.current = true;
      router.replace(buildListHref(route, stored), { scroll: false });
      return;
    }

    writeListState(route, { ...stored, ...snapshot, scrollY: stored?.scrollY ?? window.scrollY });
    void restoreListScroll(route).finally(() => {
      scrollLockedRef.current = false;
    });
    // First-mount restore only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  useEffect(() => {
    const stored = readListState(route);
    writeListState(route, { ...stored, ...snapshot, extra: options.extra ?? stored?.extra });
    if (awaitingRedirectRef.current && !isBareListState(snapshot, options.bareDefaults)) {
      awaitingRedirectRef.current = false;
      void restoreListScroll(route).finally(() => {
        scrollLockedRef.current = false;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, options.q, options.page, options.tab, JSON.stringify(options.filters), JSON.stringify(options.extra)]);

  useEffect(() => {
    if (options.persistScroll === false) return;
    let frame = 0;
    const onScroll = () => {
      if (scrollLockedRef.current) return;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const stored = readListState(route);
        writeListState(route, { ...stored, ...snapshot, scrollY: window.scrollY });
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, options.persistScroll, options.q, options.page, options.tab]);

  return snapshot;
}
