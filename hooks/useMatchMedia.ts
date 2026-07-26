'use client';

import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query. Returns `false` during SSR and before the
 * first client measurement so desktop-first markup stays stable for tests.
 */
export function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}
