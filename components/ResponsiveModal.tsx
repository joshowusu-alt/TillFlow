'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useKeyboardSafeViewport } from '@/hooks/useKeyboardSafeViewport';

type ResponsiveModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
  labelledBy?: string;
  maxWidthClassName?: string;
  panelClassName?: string;
  backdropClassName?: string;
  lockBody?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  /** When false, skip restoring focus on close (e.g. sale success restores barcode focus). */
  restoreFocus?: boolean;
  mobileFullscreen?: boolean;
  footer?: ReactNode;
  keyboardSafeFooter?: boolean;
  fitVisualViewport?: boolean;
};

export default function ResponsiveModal({
  open,
  onClose,
  children,
  ariaLabel,
  labelledBy,
  maxWidthClassName = 'max-w-md',
  panelClassName = '',
  backdropClassName = 'bg-slate-950/40 backdrop-blur-[1.5px]',
  lockBody = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  restoreFocus = true,
  mobileFullscreen = false,
  footer,
  keyboardSafeFooter = true,
  fitVisualViewport = false,
}: ResponsiveModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const viewport = useKeyboardSafeViewport();
  useBodyScrollLock(open && lockBody);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;

      const focusTarget = panel.querySelector<HTMLElement>(
        '[data-autofocus="true"], [autofocus], button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      (focusTarget ?? panel).focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (restoreFocus) {
        previousFocusRef.current?.focus();
      }
    };
  }, [open, restoreFocus]);

  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  return (
    <div className={mobileFullscreen ? 'fixed inset-0 z-50 sm:overlay-shell' : 'fixed inset-0 z-50 overlay-shell'}
      style={fitVisualViewport ? { top: viewport.viewportOffsetTop, bottom: 'auto', height: viewport.viewportHeight || '100dvh' } : undefined}>
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className={`absolute inset-0 ${backdropClassName}`}
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div className={fitVisualViewport ? "relative flex h-full items-end justify-center sm:items-center" : "relative flex min-h-[100dvh] items-end justify-center sm:min-h-full sm:items-center"}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          tabIndex={-1}
          className={`mx-auto flex w-full max-w-full flex-col bg-white shadow-xl ${
            mobileFullscreen
              ? 'h-[100dvh] rounded-none sm:h-auto sm:max-h-[min(92vh,92dvh)] sm:rounded-2xl'
              : fitVisualViewport ? 'max-h-full rounded-2xl' : 'max-h-[min(90dvh,90vh)] rounded-2xl'
          } ${maxWidthClassName} ${panelClassName}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mobile-scroll-panel min-h-0 flex-1 overscroll-contain">
            {children}
          </div>
          {footer ? (
            <div className={`flex-shrink-0 border-t border-black/5 bg-white px-4 py-3 ${keyboardSafeFooter && !fitVisualViewport ? 'keyboard-safe-bottom' : 'safe-area-bottom'}`}>
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
