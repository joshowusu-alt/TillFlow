'use client';

import { useEffect, useRef } from 'react';

/** Native focus scrolling can leave a summary's text visible while its box is covered. */
export default function ReportKeyboardFocus() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const scope = marker.current?.closest('[data-reports-focus-scope]');
    if (!scope) return;
    let keyboard = false;
    let frame = 0;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Tab') keyboard = true; };
    const onPointer = () => { keyboard = false; cancelAnimationFrame(frame); };
    const onFocus = (event: FocusEvent) => {
      const target = event.target;
      if (!keyboard || !(target instanceof HTMLElement) || !scope.contains(target)) return;
      cancelAnimationFrame(frame);
      // Allow the browser's own focus scroll first, then check the entire control.
      frame = requestAnimationFrame(() => {
        if (document.activeElement !== target || !keyboard || !target.matches(':focus-visible')) return;
        const rect = target.getBoundingClientRect();
        const bar = document.querySelector('.mobile-bottom-tab-bar')?.getBoundingClientRect();
        const header = document.querySelector('.app-shell-header');
        const headerStyle = header ? getComputedStyle(header).position : '';
        const top = header && (headerStyle === 'fixed' || headerStyle === 'sticky')
          ? Math.max(0, header.getBoundingClientRect().bottom) + 8 : 8;
        const bottom = bar && bar.height > 0 ? Math.min(innerHeight, bar.top) - 16 : innerHeight - 8;
        if (rect.height <= bottom - top && (rect.top < top || rect.bottom > bottom)) {
          target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        }
      });
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    scope.addEventListener('focusin', onFocus as EventListener);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
      scope.removeEventListener('focusin', onFocus as EventListener);
    };
  }, []);
  return <span ref={marker} hidden aria-hidden="true" />;
}
