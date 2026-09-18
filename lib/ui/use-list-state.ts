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
 */
export function useListState(route: string, options: UseListStateOptions = {}): ListStateSnapshot {
  const router = useRouter();
  const restoredRef = useRef(false);
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
      router.replace(buildListHref(route, stored), { scroll: false });
      return;
    }

    writeListState(route, { ...stored, ...snapshot, scrollY: stored?.scrollY ?? window.scrollY });
    restoreListScroll(route);
    // First-mount restore only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  useEffect(() => {
    const stored = readListState(route);
    writeListState(route, { ...stored, ...snapshot, extra: options.extra ?? stored?.extra });
  }, [route, options.q, options.page, options.tab, JSON.stringify(options.filters), JSON.stringify(options.extra)]);

  useEffect(() => {
    if (options.persistScroll === false) return;
    let frame = 0;
    const onScroll = () => {
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
  }, [route, options.persistScroll, options.q, options.page, options.tab]);

  return snapshot;
}
