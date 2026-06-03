'use client';

import { useMemo, useState } from 'react';
import { buildDemoLedger } from '@/lib/demo-fixtures';
import type { DemoProduct } from '@/lib/demo-fixtures';
import { getCurrencySymbol } from '@/lib/format';

type CartLine = { product: DemoProduct; qty: number };
type PaymentMethod = 'CASH' | 'MOMO' | 'CREDIT' | 'CARD';

export default function DemoTrySale() {
  const snapshot = useMemo(() => buildDemoLedger(), []);
  const sym = getCurrencySymbol(snapshot.currency);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>('CASH');
  const [completed, setCompleted] = useState<{
    id: string;
    totalPence: number;
    lines: CartLine[];
    payment: PaymentMethod;
    stockDeltas: Array<{ name: string; before: number; after: number }>;
  } | null>(null);

  const balances = snapshot.inventoryBalances;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snapshot.products.slice(0, 24);
    return snapshot.products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.barcode.includes(q) ||
        p.sku.toLowerCase().includes(q)
    );
  }, [query, snapshot.products]);

  const subtotalPence = cart.reduce((s, l) => s + l.qty * l.product.sellingPricePence, 0);

  function addToCart(product: DemoProduct) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  }

  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) =>
          l.product.id === productId ? { ...l, qty: Math.max(0, l.qty + delta) } : l
        )
        .filter((l) => l.qty > 0)
    );
  }

  function completeSale() {
    if (cart.length === 0) return;
    const id = `DEMO-SALE-${Date.now().toString(36).toUpperCase()}`;
    const stockDeltas = cart.map((line) => {
      const bal = balances.get(line.product.id);
      const before = bal?.endingQty ?? line.product.openingQty;
      return { name: line.product.name, before, after: Math.max(0, before - line.qty) };
    });
    setCompleted({ id, totalPence: subtotalPence, lines: [...cart], payment, stockDeltas });
    setCart([]);
    setQuery('');
  }

  function resetSession() {
    setCompleted(null);
    setCart([]);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
        <strong>Sample sale only.</strong> This practice checkout does not save to any real business. Your cart
        resets when you leave the page.
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product name, SKU or barcode…"
            className="input w-full"
            autoComplete="off"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.map((p) => {
              const bal = balances.get(p.id);
              const qty = bal?.endingQty ?? 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addToCart(p)}
                  className="rounded-xl border border-black/8 bg-white p-3 text-left shadow-sm transition hover:border-accent/30 hover:shadow-md"
                >
                  <p className="text-sm font-semibold text-ink line-clamp-2">{p.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {sym}{(p.sellingPricePence / 100).toFixed(2)} · Stock {qty} {p.unit}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card flex flex-col p-4 lg:sticky lg:top-32 lg:self-start">
          <h2 className="text-sm font-semibold text-ink">Cart</h2>
          {cart.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Add items to try a sample sale.</p>
          ) : (
            <ul className="mt-3 flex-1 space-y-2 text-sm">
              {cart.map((line) => (
                <li key={line.product.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate">{line.product.name}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="h-7 w-7 rounded border text-xs font-bold"
                      onClick={() => changeQty(line.product.id, -1)}
                    >
                      −
                    </button>
                    <span className="w-6 text-center tabular-nums">{line.qty}</span>
                    <button
                      type="button"
                      className="h-7 w-7 rounded border text-xs font-bold"
                      onClick={() => changeQty(line.product.id, 1)}
                    >
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Payment</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['CASH', 'MOMO', 'CREDIT', 'CARD'] as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayment(m)}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold ${
                    payment === m ? 'bg-accent text-white' : 'border border-black/10 bg-white text-ink'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 border-t border-black/10 pt-3">
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span className="text-accent tabular-nums">
                {sym}{(subtotalPence / 100).toFixed(2)}
              </span>
            </div>
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={completeSale}
              className="btn-primary mt-3 w-full disabled:opacity-50"
            >
              Complete sample sale
            </button>
          </div>
        </div>
      </div>

      {completed ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-emerald-950">Sale complete (sample)</h3>
              <p className="text-sm text-emerald-900/80">
                Receipt {completed.id} · {completed.payment} · {sym}
                {(completed.totalPence / 100).toFixed(2)}
              </p>
            </div>
            <button type="button" onClick={resetSession} className="btn-secondary text-sm">
              Try another sale
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-white/80 p-4 text-sm">
              <p className="font-semibold text-ink">Receipt lines</p>
              <ul className="mt-2 space-y-1">
                {completed.lines.map((l) => (
                  <li key={l.product.id} className="flex justify-between gap-2">
                    <span>
                      {l.product.name} × {l.qty}
                    </span>
                    <span className="tabular-nums">
                      {sym}{((l.qty * l.product.sellingPricePence) / 100).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-white/80 p-4 text-sm">
              <p className="font-semibold text-ink">Stock after sale (illustration)</p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {completed.stockDeltas.map((d) => (
                  <li key={d.name} className="text-xs text-muted">
                    {d.name}: {d.before} → <strong className="text-ink">{d.after}</strong>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                On a real business, the owner dashboard and reports update immediately.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
