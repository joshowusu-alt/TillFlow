'use client';

import { useEffect, useRef, useState } from 'react';
import { DEMO_BUSINESS, DEMO_POS_CART, DEMO_POS_TOTALS } from '@/lib/marketing/demo-metrics';

function formatCedi(value: number) {
  return `GH₵${value.toFixed(2)}`;
}

const ITEM_INTERVAL_MS = 420;
const START_DELAY_MS = 200;
const TOTALS_DELAY_MS = 250;
const COMPLETE_DELAY_MS = 300;

/**
 * Plays a one-time "items scan in, total builds, sale completes" sequence once
 * the card first scrolls into view — makes the checkout visual feel like an
 * active till instead of a static screenshot. Runs once per mount; settles
 * into the final state and never loops. Renders the finished state immediately
 * under prefers-reduced-motion or before JS has a chance to run.
 */
export function PosCheckoutPreview({ className = '' }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasPlayedRef = useRef(false);
  const [revealedCount, setRevealedCount] = useState<number>(DEMO_POS_CART.length);
  const [showComplete, setShowComplete] = useState(true);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    setRevealedCount(0);
    setShowComplete(false);

    const timers: number[] = [];
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || hasPlayedRef.current) return;
        hasPlayedRef.current = true;
        observer.disconnect();

        DEMO_POS_CART.forEach((_, index) => {
          timers.push(window.setTimeout(() => setRevealedCount(index + 1), START_DELAY_MS + index * ITEM_INTERVAL_MS));
        });
        const cartDoneAt = START_DELAY_MS + DEMO_POS_CART.length * ITEM_INTERVAL_MS;
        timers.push(window.setTimeout(() => setShowComplete(true), cartDoneAt + TOTALS_DELAY_MS + COMPLETE_DELAY_MS));
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const runningTotal = DEMO_POS_CART.slice(0, revealedCount).reduce((sum, item) => sum + item.priceValue, 0);
  const cartFilling = revealedCount < DEMO_POS_CART.length;

  return (
    <div ref={containerRef} data-testid="pos-cart-preview" className={`card overflow-hidden shadow-raised ${className}`}>
      <div className="border-b border-black/5 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-black/40">POS checkout</div>
            <div className="mt-1 text-sm font-semibold text-ink">
              {DEMO_BUSINESS.cashier} · {DEMO_BUSINESS.branch}
            </div>
          </div>
          <div className="rounded-full bg-accentSoft px-2.5 py-1 text-[10px] font-semibold text-accent">Till open</div>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="rounded-xl border border-black/5 bg-white px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-black/40">Scan / search product</div>
          <div className="mt-1 text-xs text-black/45">{cartFilling ? 'Scanning next item…' : 'Search by name or barcode…'}</div>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-black/5">
          <div className="border-b border-black/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-black/40">
            Cart · {revealedCount} {revealedCount === 1 ? 'item' : 'items'}
          </div>
          <div className="divide-y divide-black/5">
            {revealedCount === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-black/35">Cart is empty</div>
            ) : (
              DEMO_POS_CART.slice(0, revealedCount).map((item, index) => (
                <div
                  key={item.name}
                  className={`welcome-cart-item-enter flex items-center justify-between px-3 py-2 ${index === 0 ? 'bg-accentSoft/50' : ''}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/5 text-[10px] font-semibold text-black/50">
                        {index + 1}
                      </span>
                      <span className="truncate text-xs font-medium text-ink">{item.name}</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-ink">{item.price}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-black/40">Method</div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <span className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white">Cash</span>
            <span className="rounded-full bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-yellow-950">MoMo</span>
            <span className="rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold text-black/50">Card</span>
            <span className="rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold text-black/50">Transfer</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-black/5 bg-white p-2.5">
            <div className="text-black/45">Amount due</div>
            <div className="mt-1 text-base font-bold tabular-nums text-ink">{formatCedi(runningTotal)}</div>
          </div>
          <div className="rounded-xl border border-black/5 bg-white p-2.5">
            <div className="text-black/45">Cash tendered</div>
            <div className="mt-1 text-base font-bold tabular-nums text-ink">
              {showComplete ? DEMO_POS_TOTALS.cashTendered : '—'}
            </div>
          </div>
        </div>

        <div
          className={`mt-3 rounded-2xl border border-accent/20 bg-accentSoft p-3 transition-opacity duration-300 ${
            showComplete ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="text-[10px] font-semibold uppercase tracking-widest text-accent/70">Change due</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-accent">{DEMO_POS_TOTALS.change}</div>
        </div>

        <div
          className={`btn-primary mt-3 w-full justify-center text-sm transition-opacity duration-300 ${
            showComplete ? 'opacity-100' : 'opacity-70'
          }`}
        >
          Complete Sale — {formatCedi(runningTotal)}
        </div>
      </div>
    </div>
  );
}
