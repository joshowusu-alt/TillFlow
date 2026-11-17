'use client';

import { useEffect, useRef } from 'react';

export default function RevealInvalidSettingsField() {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = anchor.current?.closest('form');
    if (!form) return;
    let frame = 0;

    function reveal(event: Event) {
      const field = event.target;
      if (!(field instanceof HTMLElement)) return;

      let collapsed = false;
      for (let parent = field.parentElement; parent && parent !== form; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement && !parent.open) {
          parent.open = true;
          collapsed = true;
        }
      }

      // Preserve the browser's validation message and scroll to the first hidden error.
      if (collapsed && !frame) {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          field.scrollIntoView({ block: 'center' });
        });
      }
    }

    form.addEventListener('invalid', reveal, true);
    return () => {
      form.removeEventListener('invalid', reveal, true);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <span ref={anchor} hidden />;
}
