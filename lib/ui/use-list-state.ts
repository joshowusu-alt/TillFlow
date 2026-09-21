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

/** How long scroll persistence pauses after a click that leaves the list. */
export const LEAVE_GRACE_MS = 3_000;

function normalisePath(path: string): string {
  return path.replace(/\/+$/, '') || '/';
}

/** True while the browser URL still points at this list route (query string ignored). */
export function isOnListRoute(route: string): boolean {
  if (typeof window === 'undefined') return false;
  return normalisePath(window.location.pathname) === normalisePath(route);
}

/** True when following `href` leaves the list route (a record page, another section, …). */
export function leavesListRoute(route: string, href: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const target = new URL(href, window.location.href);
    if (target.origin !== window.location.origin) return true;
    return normalisePath(target.pathname) !== normalisePath(route);
  } catch {
    return false;
  }
}

/** Whether the document is currently tall enough to be scrolled to `scrollY`. */
export function canHoldScroll(scrollY: number): boolean {
  if (typeof window === 'undefined') return false;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  return maxScroll >= scrollY;
}

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
    let leavingUntil = 0;
    const persist = (scrollY: number) => {
      const stored = readListState(route);
      writeListState(route, { ...stored, ...snapshot, scrollY });
    };
    // Opening a record: snapshot the offset at the click and stop listening
    // for a moment. The loading state that follows shrinks the document and
    // the browser clamps the scroll to 0 while the URL still says this list;
    // that 0 belongs to the record page, not to the list.
    const onNavigateAway = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href || href.startsWith('#')) return;
      if (leavesListRoute(route, href)) {
        persist(window.scrollY);
        leavingUntil = Date.now() + LEAVE_GRACE_MS;
      }
    };
    const onScroll = () => {
      if (scrollLockedRef.current) return;
      if (Date.now() < leavingUntil) return;
      if (!isOnListRoute(route)) return;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (Date.now() < leavingUntil || !isOnListRoute(route)) return;
        const next = window.scrollY;
        const stored = readListState(route);
        // A jump to the very top while the document can no longer hold the
        // stored offset is a content swap (loading skeleton), not the user.
        if (next === 0 && stored?.scrollY && !canHoldScroll(stored.scrollY)) return;
        persist(next);
      });
    };
    document.addEventListener('click', onNavigateAway, true);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('click', onNavigateAway, true);
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, options.persistScroll, options.q, options.page, options.tab]);

  return snapshot;
}
