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
  mobileFullscreen?: boolean;
  footer?: ReactNode;
  keyboardSafeFooter?: boolean;
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
  mobileFullscreen = false,
  footer,
  keyboardSafeFooter = true,
}: ResponsiveModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useKeyboardSafeViewport();
  useBodyScrollLock(open && lockBody);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    const frame = window.requestAnimationFrame(() => {
      const focusTarget = panelRef.current?.querySelector<HTMLElement>(
        '[data-autofocus="true"], [autofocus], button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      focusTarget?.focus();
      if (!focusTarget) {
        panelRef.current?.focus();
      }
    });

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={mobileFullscreen ? 'fixed inset-0 z-50 sm:overlay-shell' : 'fixed inset-0 z-50 overlay-shell'}>
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className={`absolute inset-0 ${backdropClassName}`}
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div className="relative flex min-h-full items-end justify-center sm:items-center">
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
              : 'max-h-[min(92vh,92dvh)] rounded-2xl'
          } ${maxWidthClassName} ${panelClassName}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mobile-scroll-panel flex-1">
            {children}
          </div>
          {footer ? (
            <div className={`border-t border-black/5 bg-white px-4 py-3 ${keyboardSafeFooter ? 'keyboard-safe-bottom' : 'safe-area-bottom'}`}>
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
