'use client';

import type { ReactNode } from 'react';
import ResponsiveModal from '@/components/ResponsiveModal';

type PosMobileCartCheckoutSheetProps = {
  open: boolean;
  onClose: () => void;
  /** When true, Escape / backdrop / close cannot dismiss (active submission). */
  dismissible?: boolean;
  /** Sticky alert under the header (e.g. sale submission errors). */
  banner?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * Unified phone cart + checkout sheet. Presentation only — state stays in PosClient.
 */
export default function PosMobileCartCheckoutSheet({
  open,
  onClose,
  dismissible = true,
  banner,
  children,
  footer,
}: PosMobileCartCheckoutSheetProps) {
  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      labelledBy="pos-mobile-cart-checkout-title"
      maxWidthClassName="max-w-lg"
      panelClassName="rounded-t-2xl border border-black/10 sm:rounded-2xl"
      backdropClassName="bg-slate-950/45 backdrop-blur-[1.5px]"
      closeOnBackdrop={dismissible}
      closeOnEscape={dismissible}
      restoreFocus
      keyboardSafeFooter
      footer={footer}
    >
      <div className="sticky top-0 z-10 border-b border-black/5 bg-white">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 id="pos-mobile-cart-checkout-title" className="text-base font-semibold text-ink">
            Cart &amp; checkout
          </h2>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-black/10 bg-white px-3 text-sm font-semibold text-black/70 transition hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
            onClick={onClose}
            disabled={!dismissible}
            aria-label="Close cart and checkout"
            data-pos-mobile-sheet-close="true"
            data-autofocus="true"
          >
            Close
          </button>
        </div>
        {banner ? (
          <div className="border-t border-black/5 px-3 pb-3 pt-0 sm:px-4" data-pos-mobile-sheet-banner="true">
            {banner}
          </div>
        ) : null}
      </div>
      <div className="space-y-3 px-3 py-3 sm:px-4" data-pos-mobile-cart-checkout-body="true">
        {children}
      </div>
    </ResponsiveModal>
  );
}
