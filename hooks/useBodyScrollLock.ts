'use client';

import { useEffect } from 'react';

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (typeof document === 'undefined' || !locked) return;

    const body = document.body;
    const html = document.documentElement;
    const activeLocks = Number(body.dataset.scrollLockCount ?? '0');

    if (activeLocks === 0) {
      body.dataset.scrollLockBodyOverflow = body.style.overflow;
      html.dataset.scrollLockHtmlOverflow = html.style.overflow;
      body.style.overflow = 'hidden';
      html.style.overflow = 'hidden';
    }

    body.dataset.scrollLockCount = String(activeLocks + 1);

    return () => {
      const remainingLocks = Math.max(0, Number(body.dataset.scrollLockCount ?? '1') - 1);

      if (remainingLocks === 0) {
        body.style.overflow = body.dataset.scrollLockBodyOverflow ?? '';
        html.style.overflow = html.dataset.scrollLockHtmlOverflow ?? '';
        delete body.dataset.scrollLockCount;
        delete body.dataset.scrollLockBodyOverflow;
        delete html.dataset.scrollLockHtmlOverflow;
        return;
      }

      body.dataset.scrollLockCount = String(remainingLocks);
    };
  }, [locked]);
}
