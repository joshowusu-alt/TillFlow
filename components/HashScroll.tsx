'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const STICKY_OFFSET_PX = 88;

/** Scroll to #hash targets after client navigation (App Router). */
export default function HashScroll({ offset = STICKY_OFFSET_PX, targetId }: { offset?: number; targetId?: string }) {
  const pathname = usePathname();
  useEffect(() => {
    const scrollToHash = () => {
      let hash: string;
      try { hash = decodeURIComponent(window.location.hash.replace(/^#/, '') || targetId || ''); } catch { return; }
      if (!hash) return;
      const el = document.getElementById(hash);
      if (!el) return;
      let ancestor: HTMLElement | null = el;
      while (ancestor) {
        if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
        ancestor = ancestor.parentElement;
      }
      el.style.scrollMarginTop = `${offset}px`;
      // Delay slightly so layout/sticky header have settled after App Router nav.
      window.requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      });
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
      if (link) window.requestAnimationFrame(scrollToHash);
    };
    scrollToHash();
    // Retry once for slow client hydration of the settings form.
    const retry = window.setTimeout(scrollToHash, 120);
    window.addEventListener('hashchange', scrollToHash);
    document.addEventListener('click', onClick);
    return () => {
      window.clearTimeout(retry);
      window.removeEventListener('hashchange', scrollToHash);
      document.removeEventListener('click', onClick);
    };
  }, [offset, pathname, targetId]);

  return null;
}
