'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

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
}: ResponsiveModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

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
    <div className="fixed inset-0 z-50 overlay-shell">
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
          className={`mx-auto w-full max-w-full ${maxWidthClassName} max-h-[min(92vh,92dvh)] overflow-y-auto rounded-2xl bg-white shadow-xl ${panelClassName}`}
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
