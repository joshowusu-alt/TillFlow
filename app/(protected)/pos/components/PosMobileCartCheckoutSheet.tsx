'use client';

import { useEffect, useState, type ReactNode } from 'react';
import ResponsiveModal from '@/components/ResponsiveModal';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { getPendingSales } from '@/lib/offline';

type PosMobileCartCheckoutSheetProps = {
  open: boolean;
  businessId: string;
  onClose: () => void;
  /** When true, Escape / backdrop / close cannot dismiss (active submission). */
  dismissible?: boolean;
  /** Sticky alert under the header (e.g. sale submission errors). */
  banner?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  summary?: ReactNode;
};

/**
 * Unified phone cart + checkout sheet. Presentation only — state stays in PosClient.
 */
export default function PosMobileCartCheckoutSheet({
  open,
  businessId,
  onClose,
  dismissible = true,
  banner,
  children,
  footer,
  summary,
}: PosMobileCartCheckoutSheetProps) {
  const [view, setView] = useState<'cart' | 'payment'>('cart');
  const online = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    setPendingCount(0);
    if (!open || online) return;
    let active = true;
    const refresh = async () => {
      try {
        const sales = await getPendingSales(businessId);
        if (active) setPendingCount(sales.length);
      } catch {
        if (active) setPendingCount(0);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [open, online, businessId]);
  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      labelledBy="pos-mobile-cart-checkout-title"
      maxWidthClassName="max-w-lg"
      panelClassName="max-sm:mb-[calc(env(safe-area-inset-bottom,0px)+2rem)] rounded-t-2xl border border-black/10 sm:rounded-2xl"
      backdropClassName="bg-slate-950/45 backdrop-blur-[1.5px]"
      closeOnBackdrop={dismissible}
      closeOnEscape={dismissible}
      restoreFocus
      keyboardSafeFooter
      footer={<div className="space-y-2" data-pos-mobile-sheet-footer="true">{summary}{view === 'cart' ? <button type="button" className="btn-primary min-h-12 w-full" onClick={() => setView('payment')}>Continue to payment →</button> : footer}</div>}
    >
      <div className="sticky top-0 z-10 border-b border-black/5 bg-white">
        {!online && <div data-pos-offline-strip="true" role="status" className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs leading-snug text-amber-950">
          Offline: sales are saved on this device and sync when you're back online.
          {pendingCount > 0 && <span className="block font-semibold">{pendingCount} {pendingCount === 1 ? 'sale' : 'sales'} waiting to sync</span>}
        </div>}
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
        <div className="flex gap-2 px-4 pb-3" aria-label="Cart and payment steps"><button type="button" className={view === 'cart' ? 'btn-primary flex-1' : 'btn-secondary flex-1'} aria-pressed={view === 'cart'} disabled={!dismissible} onClick={() => setView('cart')}>Cart</button><button type="button" className={view === 'payment' ? 'btn-primary flex-1' : 'btn-secondary flex-1'} aria-pressed={view === 'payment'} disabled={!dismissible} onClick={() => setView('payment')}>Payment</button></div>
        {banner ? (
          <div className="border-t border-black/5 px-3 pb-3 pt-0 sm:px-4" data-pos-mobile-sheet-banner="true">
            {banner}
          </div>
        ) : null}
      </div>
      <div className="space-y-3 px-3 py-3 sm:px-4" data-pos-mobile-cart-checkout-body="true" data-pos-mobile-view={view}>
        {children}
      </div>
    </ResponsiveModal>
  );
}
