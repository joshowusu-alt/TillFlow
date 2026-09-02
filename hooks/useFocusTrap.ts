'use client';

import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function focusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

/**
 * Keyboard focus trap for modal dialogs/drawers. Moves focus inside on open,
 * cycles Tab/Shift+Tab, closes on Escape, and restores the previously focused node.
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onEscape: () => void,
) {
  useEffect(() => {
    if (!active) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = containerRef.current;
    if (!root) return;

    const focusFirst = () => {
      const nodes = focusableElements(root);
      const preferred =
        root.querySelector<HTMLElement>('[data-autofocus="true"]') ?? nodes[0] ?? root;
      preferred.focus();
    };

    const frame = window.requestAnimationFrame(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onEscape();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = focusableElements(root);
      if (nodes.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const current = document.activeElement;
      if (!current || !root.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey) {
        if (current === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown, true);
      window.requestAnimationFrame(() => previous?.focus());
    };
  }, [active, containerRef, onEscape]);
}
