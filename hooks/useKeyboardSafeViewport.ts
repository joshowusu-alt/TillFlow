'use client';

import { useEffect, useState } from 'react';

type KeyboardSafeViewport = {
  keyboardOpen: boolean;
  bottomInset: number;
  viewportHeight: number;
};

const DEFAULT_STATE: KeyboardSafeViewport = {
  keyboardOpen: false,
  bottomInset: 0,
  viewportHeight: 0,
};

function getViewportState(): KeyboardSafeViewport {
  if (typeof window === 'undefined') return DEFAULT_STATE;

  const layoutHeight = window.innerHeight;
  const visualViewport = window.visualViewport;
  const viewportHeight = Math.round(visualViewport?.height ?? layoutHeight);
  const viewportOffsetTop = Math.round(visualViewport?.offsetTop ?? 0);
  const bottomInset = Math.max(0, Math.round(layoutHeight - viewportHeight - viewportOffsetTop));
  const keyboardOpen = bottomInset > 80;

  return {
    keyboardOpen,
    bottomInset: keyboardOpen ? bottomInset : 0,
    viewportHeight,
  };
}

export function useKeyboardSafeViewport(): KeyboardSafeViewport {
  const [state, setState] = useState<KeyboardSafeViewport>(DEFAULT_STATE);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const next = getViewportState();
        setState(next);
        document.documentElement.style.setProperty('--keyboard-safe-bottom', `${next.bottomInset}px`);
        document.documentElement.style.setProperty('--visual-viewport-height', `${next.viewportHeight}px`);
        document.documentElement.toggleAttribute('data-keyboard-open', next.keyboardOpen);
      });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);

    const updateTextEntryState = () => {
      const active = document.activeElement;
      const textEntryActive = active instanceof HTMLInputElement
        || active instanceof HTMLTextAreaElement
        || active instanceof HTMLSelectElement;
      document.documentElement.toggleAttribute('data-text-entry-active', textEntryActive);
    };

    document.addEventListener('focusin', updateTextEntryState);
    document.addEventListener('focusout', updateTextEntryState);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      document.removeEventListener('focusin', updateTextEntryState);
      document.removeEventListener('focusout', updateTextEntryState);
      document.documentElement.removeAttribute('data-text-entry-active');
    };
  }, []);

  return state;
}
