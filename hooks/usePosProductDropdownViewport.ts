'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';
import { calculateCompactDropdownViewport } from '@/lib/payments/pos-scanner';

type Viewport = { top: number; maxHeight: number };

type DropdownViewportResult = {
  /** True when the page width is below the POS compact breakpoint (640px). */
  isCompactViewport: boolean;
  /** Computed top + maxHeight for the dropdown in compact mode. */
  viewport: Viewport;
  /** Recompute manually (for example after an orientation change triggered elsewhere). */
  recompute: () => void;
};

/**
 * Tracks whether the POS product dropdown should render in compact mode
 * and keeps its top/maxHeight in sync with the virtual keyboard, window
 * resize, and orientation changes.
 *
 * Only the `dropdownOpen` case sets up the listeners — on desktop / when
 * closed we stay cheap and idle.
 */
export function usePosProductDropdownViewport(
  dropdownOpen: boolean,
  shellRef: RefObject<HTMLElement>
): DropdownViewportResult {
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({ top: 112, maxHeight: 320 });

  const recompute = useCallback(() => {
    if (typeof window === 'undefined') return;
    const compact = window.innerWidth < 640;
    setIsCompactViewport(compact);
    if (!compact) return;

    const visualViewport = window.visualViewport;
    const next = calculateCompactDropdownViewport({
      viewportHeight: visualViewport?.height ?? window.innerHeight,
      viewportOffsetTop: visualViewport?.offsetTop ?? 0,
      shellBottom: shellRef.current?.getBoundingClientRect().bottom ?? null,
    });
    setViewport(next);
  }, [shellRef]);

  // Initial measurement once the hook is mounted.
  useEffect(() => {
    recompute();
  }, [recompute]);

  // Live listeners only while the dropdown is open. We also react to the
  // visualViewport because iOS Safari shrinks it when the keyboard opens.
  useEffect(() => {
    if (!dropdownOpen) return;
    recompute();

    const handle = () => window.requestAnimationFrame(recompute);
    window.addEventListener('resize', handle);
    window.addEventListener('orientationchange', handle);
    window.visualViewport?.addEventListener('resize', handle);
    window.visualViewport?.addEventListener('scroll', handle);

    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('orientationchange', handle);
      window.visualViewport?.removeEventListener('resize', handle);
      window.visualViewport?.removeEventListener('scroll', handle);
    };
  }, [dropdownOpen, recompute]);

  return { isCompactViewport, viewport, recompute };
}
