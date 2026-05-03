'use client';

import { useEffect } from 'react';

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (typeof document === 'undefined' || !locked) return;

    const body = document.body;
    const html = document.documentElement;
    const activeLocks = Number(body.dataset.scrollLockCount ?? '0');

    if (activeLocks === 0) {
      const scrollY = window.scrollY;
      body.dataset.scrollLockBodyOverflow = body.style.overflow;
      body.dataset.scrollLockBodyPosition = body.style.position;
      body.dataset.scrollLockBodyTop = body.style.top;
      body.dataset.scrollLockBodyWidth = body.style.width;
      body.dataset.scrollLockScrollY = String(scrollY);
      html.dataset.scrollLockHtmlOverflow = html.style.overflow;
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      html.style.overflow = 'hidden';
    }

    body.dataset.scrollLockCount = String(activeLocks + 1);

    return () => {
      const remainingLocks = Math.max(0, Number(body.dataset.scrollLockCount ?? '1') - 1);

      if (remainingLocks === 0) {
        const scrollY = Number(body.dataset.scrollLockScrollY ?? '0');
        body.style.overflow = body.dataset.scrollLockBodyOverflow ?? '';
        body.style.position = body.dataset.scrollLockBodyPosition ?? '';
        body.style.top = body.dataset.scrollLockBodyTop ?? '';
        body.style.width = body.dataset.scrollLockBodyWidth ?? '';
        html.style.overflow = html.dataset.scrollLockHtmlOverflow ?? '';
        delete body.dataset.scrollLockCount;
        delete body.dataset.scrollLockBodyOverflow;
        delete body.dataset.scrollLockBodyPosition;
        delete body.dataset.scrollLockBodyTop;
        delete body.dataset.scrollLockBodyWidth;
        delete body.dataset.scrollLockScrollY;
        delete html.dataset.scrollLockHtmlOverflow;
        window.scrollTo(0, scrollY);
        return;
      }

      body.dataset.scrollLockCount = String(remainingLocks);
    };
  }, [locked]);
}
