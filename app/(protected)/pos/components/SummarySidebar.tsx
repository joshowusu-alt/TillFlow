import { memo } from 'react';
import { formatMoney } from '@/lib/format';
import Link from 'next/link';

interface ParkedCart {
  id: string;
  label: string;
  itemCount: number;
  parkedAt: string;
}

interface Props {
  business: { currency: string; vatEnabled: boolean };
  store: { name: string };
  cartItemCount: number;
  totals: { subtotal: number; lineDiscount: number; promoDiscount: number; netSubtotal: number; vat: number };
  orderDiscount: number;
  vatTotal: number;
  totalDue: number;
  totalPaid: number;
  balanceRemaining: number;
  cashTenderedValue: number;
  changeDue: number;
  hasCash: boolean;
  lastReceiptId: string;
  parkedCarts: ParkedCart[];
  showParkedPanel: boolean;
  onToggleParkedPanel: () => void;
  onRecallParked: (id: string) => void;
  onDeleteParked: (id: string) => void;
}

function SummarySidebar({
  business,
  store,
  cartItemCount,
  totals,
  orderDiscount,
  vatTotal,
  totalDue,
  totalPaid,
  balanceRemaining,
  cashTenderedValue,
  changeDue,
  hasCash,
  lastReceiptId,
  parkedCarts,
  showParkedPanel,
  onToggleParkedPanel,
  onRecallParked,
  onDeleteParked,
}: Props) {
  return (
    <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-widest text-black/40">Summary</div>
          <div className="text-xs text-black/30">{store.name}</div>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-black/50">Items</span>
            <span className="font-semibold">{cartItemCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-black/50">Subtotal</span>
            <span className="font-semibold">{formatMoney(totals.subtotal, business.currency)}</span>
          </div>
          {totals.lineDiscount > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Line discounts</span>
              <span className="font-semibold">-{formatMoney(totals.lineDiscount, business.currency)}</span>
            </div>
          )}
          {totals.promoDiscount > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Promos</span>
              <span className="font-semibold">-{formatMoney(totals.promoDiscount, business.currency)}</span>
            </div>
          )}
          {orderDiscount > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Order discount</span>
              <span className="font-semibold">-{formatMoney(orderDiscount, business.currency)}</span>
            </div>
          )}
          {business.vatEnabled && (
            <div className="flex justify-between text-black/50">
              <span>VAT</span>
              <span className="font-semibold">{formatMoney(vatTotal, business.currency)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-black/10 pt-3">
            <span className="text-lg font-semibold">Total</span>
            <span className="text-2xl font-bold">{formatMoney(totalDue, business.currency)}</span>
          </div>
          {totalPaid > 0 && (
            <div className="flex justify-between">
              <span className="text-black/50">Paid</span>
              <span className="font-semibold">{formatMoney(totalPaid, business.currency)}</span>
            </div>
          )}
          {balanceRemaining > 0 && (
            <div className="flex justify-between text-rose font-semibold">
              <span>Balance</span>
              <span>{formatMoney(balanceRemaining, business.currency)}</span>
            </div>
          )}
        </div>
      </div>

      {changeDue > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-accent to-blue-900 px-5 py-5 text-white shadow-lg ring-4 ring-blue-200">
          <div className="text-center">
            <div className="text-[11px] font-medium uppercase tracking-[0.3em] opacity-80">Change Due</div>
            <div className="mt-1.5 text-4xl font-bold tracking-tight">
              {formatMoney(changeDue, business.currency)}
            </div>
          </div>
        </div>
      )}

      {hasCash && (
        <div className="card px-4 py-3 text-sm">
          <div className="flex justify-between text-black/50">
            <span>Cash tendered</span>
            <span className="font-semibold text-black">{formatMoney(cashTenderedValue, business.currency)}</span>
          </div>
        </div>
      )}

      {/* ── Parked Sales ─────────────────────────────── */}
      {parkedCarts.length > 0 && (
        <div className="card overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 transition"
            onClick={onToggleParkedPanel}
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Parked Sales ({parkedCarts.length})
            </span>
            <svg className={`h-4 w-4 transition-transform ${showParkedPanel ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showParkedPanel && (
            <div className="divide-y divide-black/5">
              {parkedCarts.map((parked) => (
                <div key={parked.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold truncate">{parked.label}</span>
                    <span className="text-[10px] text-black/40">{new Date(parked.parkedAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-xs text-black/50">{parked.itemCount} item{parked.itemCount !== 1 ? 's' : ''}</div>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-800"
                      onClick={() => onRecallParked(parked.id)}
                    >
                      Recall
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold text-red-500 hover:text-red-700"
                      onClick={() => onDeleteParked(parked.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {lastReceiptId && (
        <Link
          href={`/receipts/${lastReceiptId}`}
          target="_blank"
          className="flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-xs font-semibold text-black/60 hover:bg-black/5 transition"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Reprint last receipt
        </Link>
      )}

      <div className="rounded-xl bg-black/[.03] p-3 text-[11px] text-black/40 space-y-1">
        <div className="flex justify-between"><span>F2</span><span>Barcode</span></div>
        <div className="flex justify-between"><span>F3</span><span>Product search</span></div>
        <div className="flex justify-between"><span>F8</span><span>Cash field</span></div>
        <div className="flex justify-between"><span>F9</span><span>Park sale</span></div>
        <div className="flex justify-between"><span>Ctrl+Enter</span><span>Complete sale</span></div>
        <div className="flex justify-between"><span>Ctrl+Z</span><span>Undo</span></div>
        <div className="flex justify-between"><span>?</span><span>All shortcuts</span></div>
      </div>
    </div>
  );
}

export default memo(SummarySidebar);
