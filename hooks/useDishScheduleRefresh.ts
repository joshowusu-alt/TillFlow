'use client';

import { useEffect, useState } from 'react';

// Refresh open catalogues across business midnight, including tabs left in the background.
export function useDishScheduleRefresh(enabled: boolean) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => setRevision((value) => value + 1);
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [enabled]);
  return revision;
}
