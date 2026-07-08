import { DEMO_BUSINESS, DEMO_POS_CART, DEMO_POS_TOTALS } from '@/lib/marketing/demo-metrics';

export function PosCheckoutPreview({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  return (
    <div className={`card overflow-hidden shadow-raised ${className}`}>
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
          <div className="mt-1 text-xs text-black/45">Search by name or barcode…</div>
        </div>

        <div className={`mt-3 overflow-hidden rounded-xl border border-black/5 ${compact ? '' : ''}`}>
          <div className="border-b border-black/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-black/40">
            Cart · {DEMO_POS_CART.length} items
          </div>
          <div className="divide-y divide-black/5">
            {DEMO_POS_CART.map((item, index) => (
              <div key={item.name} className={`flex items-center justify-between px-3 py-2 ${index === 0 ? 'bg-accentSoft/50' : ''}`}>
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
            ))}
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
            <div className="mt-1 text-base font-bold tabular-nums text-ink">{DEMO_POS_TOTALS.amountDue}</div>
          </div>
          <div className="rounded-xl border border-black/5 bg-white p-2.5">
            <div className="text-black/45">Cash tendered</div>
            <div className="mt-1 text-base font-bold tabular-nums text-ink">{DEMO_POS_TOTALS.cashTendered}</div>
          </div>
        </div>

        {/* Soft treatment so the solid-blue Complete Sale button below stays the only button-looking element. */}
        <div className="mt-3 rounded-2xl border border-accent/20 bg-accentSoft p-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-accent/70">Change due</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-accent">{DEMO_POS_TOTALS.change}</div>
        </div>

        <div className="btn-primary mt-3 w-full justify-center text-sm">Complete Sale — {DEMO_POS_TOTALS.amountDue}</div>
      </div>
    </div>
  );
}
