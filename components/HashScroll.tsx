'use client';

import { useEffect } from 'react';

const STICKY_OFFSET_PX = 88;

/** Scroll to #hash targets after client navigation (App Router). */
export default function HashScroll() {
  useEffect(() => {
    const scrollToHash = () => {
      const hash = window.location.hash?.replace(/^#/, '');
      if (!hash) return;
      const el = document.getElementById(hash);
      if (!el) return;
      el.style.scrollMarginTop = `${STICKY_OFFSET_PX}px`;
      // Delay slightly so layout/sticky header have settled after App Router nav.
      window.requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    };

    scrollToHash();
    // Retry once for slow client hydration of the settings form.
    const retry = window.setTimeout(scrollToHash, 120);
    window.addEventListener('hashchange', scrollToHash);
    return () => {
      window.clearTimeout(retry);
      window.removeEventListener('hashchange', scrollToHash);
    };
  }, []);

  return null;
}
