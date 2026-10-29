'use client';

import { useEffect, useState } from 'react';

/** Close long-lived connections while inactive, then reconnect on resume. */
export function usePageActive() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const update = () => setActive(document.visibilityState !== 'hidden' && navigator.onLine !== false);
    update();
    document.addEventListener('visibilitychange', update);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('focus', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('focus', update);
    };
  }, []);
  return active;
}
