'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Native modal semantics keep focus and touch interaction inside the active panel. */
export default function ModalPanel({ children, label, onClose }: { children: ReactNode; label: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted) return;
    const dialog = dialogRef.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(
    <dialog ref={dialogRef} aria-label={label}
      className="control-modal fixed inset-0 m-0 h-[100dvh] max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-control-ink backdrop:bg-black/35"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="pointer-events-none flex h-full justify-end sm:p-4">
        <div className="pointer-events-auto flex h-full w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl">
          {children}
        </div>
      </div>
    </dialog>, document.body
  );
}
