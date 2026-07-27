'use client';

import { forwardRef } from 'react';
import { formatMoney } from '@/lib/format';

type PosMobileCartBarProps = {
  itemCount: number;
  totalPence: number;
  currency: string;
  onOpen: () => void;
};

/**
 * Phone-only persistent cart summary. Opens the unified cart & checkout sheet.
 * Not a completion control — payment stays inside the sheet.
 */
const PosMobileCartBar = forwardRef<HTMLButtonElement, PosMobileCartBarProps>(
  function PosMobileCartBar({ itemCount, totalPence, currency, onOpen }, ref) {
    const itemLabel = `${itemCount} item${itemCount === 1 ? '' : 's'}`;
    const totalLabel = formatMoney(totalPence, currency);
    const accessibleName = `View cart, ${itemLabel}, ${totalLabel}`;

    return (
      <div
        className="fixed inset-x-0 z-30 border-t border-black/10 bg-white px-3 pt-2.5 pb-[calc(0.65rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] keyboard-safe-fixed-bottom"
        data-pos-mobile-cart-bar="true"
      >
        <button
          ref={ref}
          type="button"
          onClick={onOpen}
          className="flex w-full min-h-12 items-center gap-3 rounded-2xl border border-black/10 bg-slate-50 px-3.5 py-2.5 text-left transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={accessibleName}
          data-pos-mobile-cart-bar-open="true"
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent" aria-hidden="true">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-black/50">{itemLabel}</span>
            <span className="block truncate text-base font-bold text-ink">{totalLabel}</span>
          </span>
          <span className="flex-shrink-0 text-sm font-semibold text-accent">View cart</span>
        </button>
      </div>
    );
  },
);

export default PosMobileCartBar;
