'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  getPendingSales,
  getOfflineSale,
  updateOfflineSale,
  getCachedProducts,
  type OfflineSale,
  type OfflineProduct,
} from '@/lib/offline';
import { formatMoney } from '@/lib/format';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type AmendingState = {
  sale: OfflineSale;
  removedIndices: Set<number>;
  newLines: {
    productId: string;
    productName: string;
    unitId: string;
    unitName: string;
    qtyInUnit: number;
    unitPricePence: number;
    lineTotalPence: number;
  }[];
};

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function OfflineSalesPage() {
  const [sales, setSales] = useState<OfflineSale[]>([]);
  const [products, setProducts] = useState<OfflineProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('GHS');

  // Amend state
  const [amending, setAmending] = useState<AmendingState | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /* ---- Load data ---- */
  const refresh = useCallback(async () => {
    try {
      const [pending, cached] = await Promise.all([
        getPendingSales(),
        getCachedProducts(),
      ]);
      setSales(pending);
      setProducts(cached);

      // Try to get currency from cached business
      const { getCachedBusiness } = await import('@/lib/offline');
      const biz = await getCachedBusiness();
      if (biz?.currency) setCurrency(biz.currency);
    } catch (e) {
      console.error('Failed to load offline sales:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /* ---- Product map for name lookups ---- */
  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  /* ---- Helpers ---- */
  const lineName = (line: OfflineSale['lines'][number]) => {
    const p = productMap.get(line.productId);
    return p?.name ?? line.productId.slice(0, 8);
  };

  const lineUnit = (line: OfflineSale['lines'][number]) => {
    const p = productMap.get(line.productId);
    if (!p) return '';
    const u = p.units.find((u) => u.id === line.unitId);
    return u?.name ?? '';
  };

  const linePrice = (line: OfflineSale['lines'][number]) => {
    const p = productMap.get(line.productId);
    if (!p) return 0;
    const u = p.units.find((u) => u.id === line.unitId);
    const conversionToBase = u?.conversionToBase ?? 1;
    return p.sellingPriceBasePence * conversionToBase * line.qtyInUnit;
  };

  const saleTotal = (sale: OfflineSale) =>
    sale.lines.reduce((sum, l) => sum + linePrice(l), 0);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  /* ---- Open amend ---- */
  const startAmend = async (saleId: string) => {
    const sale = await getOfflineSale(saleId);
    if (!sale || sale.synced) return;
    setAmending({ sale, removedIndices: new Set(), newLines: [] });
    setSearchQuery('');
  };

  /* ---- Amend actions ---- */
  const toggleRemoveLine = (idx: number) => {
    if (!amending) return;
    const next = new Set(amending.removedIndices);
    if (next.has(idx)) next.delete(idx);
    else {
      // Don't allow removing ALL lines if no new lines added
      const keptCount =
        amending.sale.lines.length - next.size - 1 + amending.newLines.length;
      if (keptCount < 1) return;
      next.add(idx);
    }
    setAmending({ ...amending, removedIndices: next });
  };

  const addNewLine = (product: OfflineProduct) => {
    if (!amending) return;
    const baseUnit =
      product.units.find((u) => u.isBaseUnit) ?? product.units[0];
    if (!baseUnit) return;
    const unitPricePence =
      product.sellingPriceBasePence * baseUnit.conversionToBase;
    setAmending({
      ...amending,
      newLines: [
        ...amending.newLines,
        {
          productId: product.id,
          productName: product.name,
          unitId: baseUnit.id,
          unitName: baseUnit.name,
          qtyInUnit: 1,
          unitPricePence,
          lineTotalPence: unitPricePence,
        },
      ],
    });
    setSearchQuery('');
  };

  const updateNewLineQty = (productId: string, qty: number) => {
    if (!amending) return;
    if (qty <= 0) {
      setAmending({
        ...amending,
        newLines: amending.newLines.filter((l) => l.productId !== productId),
      });
      return;
    }
    setAmending({
      ...amending,
      newLines: amending.newLines.map((l) =>
        l.productId === productId
          ? { ...l, qtyInUnit: qty, lineTotalPence: l.unitPricePence * qty }
          : l
      ),
    });
  };

  const removeNewLine = (productId: string) => {
    if (!amending) return;
    setAmending({
      ...amending,
      newLines: amending.newLines.filter((l) => l.productId !== productId),
    });
  };

  /* ---- Save amended sale back to IndexedDB ---- */
  const saveAmend = async () => {
    if (!amending) return;
    setSaving(true);
    try {
      const kept = amending.sale.lines.filter(
        (_, i) => !amending.removedIndices.has(i)
      );
      const added = amending.newLines.map((l) => ({
        productId: l.productId,
        unitId: l.unitId,
        qtyInUnit: l.qtyInUnit,
        discountType: 'NONE',
        discountValue: '0',
      }));
      const updatedSale: OfflineSale = {
        ...amending.sale,
        lines: [...kept, ...added],
      };
      await updateOfflineSale(updatedSale);
      setAmending(null);
      showToast('Sale amended successfully');
      await refresh();
    } catch (e) {
      console.error('Failed to save amended sale:', e);
      showToast('Failed to save — please try again');
    } finally {
      setSaving(false);
    }
  };

  const hasAmendChanges =
    amending &&
    (amending.removedIndices.size > 0 || amending.newLines.length > 0);

  /* ---- Filtered products for add panel ---- */
  const filteredProducts = useMemo(() => {
    if (!amending) return [];
    const existingIds = new Set([
      ...amending.sale.lines
        .filter((_, i) => !amending.removedIndices.has(i))
        .map((l) => l.productId),
      ...amending.newLines.map((l) => l.productId),
    ]);
    let list = products.filter((p) => !existingIds.has(p.id));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    }
    return list.slice(0, 20);
  }, [amending, products, searchQuery]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="animate-pulse text-sm text-black/50">
          Loading pending sales…
        </div>
      </div>
    );
  }

  /* ---- Amend view ---- */
  if (amending) {
    const keptLinesTotal = amending.sale.lines
      .filter((_, i) => !amending.removedIndices.has(i))
      .reduce((s, l) => s + linePrice(l), 0);
    const addedTotal = amending.newLines.reduce(
      (s, l) => s + l.lineTotalPence,
      0
    );
    const newTotal = keptLinesTotal + addedTotal;

    return (
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Amend Offline Sale</h1>
            <p className="text-sm text-black/50">
              {new Date(amending.sale.createdAt).toLocaleString()}
            </p>
          </div>
          <button
            onClick={() => setAmending(null)}
            className="btn-ghost text-sm"
          >
            ← Back
          </button>
        </div>

        {/* Current items */}
        <div className="card p-4 space-y-2">
          <h3 className="text-sm font-semibold text-black/70">
            Current Items
          </h3>
          {amending.sale.lines.map((line, idx) => {
            const removed = amending.removedIndices.has(idx);
            const isLastKept =
              !removed &&
              amending.sale.lines.length - amending.removedIndices.size === 1 &&
              amending.newLines.length === 0;
            return (
              <div
                key={idx}
                className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                  removed
                    ? 'border-rose-300 bg-rose-50'
                    : 'border-black/10 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleRemoveLine(idx)}
                  disabled={isLastKept}
                  className={`flex-none rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    removed
                      ? 'bg-rose-600 text-white hover:bg-rose-700'
                      : isLastKept
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-black/5 text-black/70 hover:bg-rose-100 hover:text-rose-700'
                  }`}
                >
                  {removed ? 'Undo' : 'Remove'}
                </button>
                <div
                  className={`flex-1 min-w-0 ${removed ? 'line-through opacity-50' : ''}`}
                >
                  <div className="text-sm font-semibold truncate">
                    {lineName(line)}
                  </div>
                  <div className="text-xs text-black/50">
                    {line.qtyInUnit} × {lineUnit(line)}
                  </div>
                </div>
                <div
                  className={`text-sm font-semibold ${removed ? 'line-through opacity-50' : ''}`}
                >
                  {formatMoney(linePrice(line), currency)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Added items */}
        {amending.newLines.length > 0 && (
          <div className="card p-4 space-y-2">
            <h3 className="text-sm font-semibold text-black/70">
              Items to Add
            </h3>
            {amending.newLines.map((item) => (
              <div
                key={item.productId}
                className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3"
              >
                <button
                  type="button"
                  onClick={() => removeNewLine(item.productId)}
                  className="flex-none rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-200 transition-colors"
                >
                  Remove
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {item.productName}
                  </div>
                  <div className="text-xs text-black/50">{item.unitName}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateNewLineQty(item.productId, item.qtyInUnit - 1)
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/5 text-sm font-bold hover:bg-black/10"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-semibold">
                    {item.qtyInUnit}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateNewLineQty(item.productId, item.qtyInUnit + 1)
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/5 text-sm font-bold hover:bg-black/10"
                  >
                    +
                  </button>
                </div>
                <div className="text-sm font-semibold text-emerald-700 w-20 text-right">
                  {formatMoney(item.lineTotalPence, currency)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Search / add products */}
        <div className="card p-4 space-y-2">
          <h3 className="text-sm font-semibold text-black/70">
            Add Products
          </h3>
          <input
            type="text"
            className="input w-full"
            placeholder="Search products by name or barcode…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery.trim() && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-black/10 bg-white">
              {filteredProducts.length === 0 ? (
                <div className="p-4 text-center text-sm text-black/50">
                  No products found
                </div>
              ) : (
                <div className="divide-y divide-black/5">
                  {filteredProducts.map((product) => {
                    const baseUnit =
                      product.units.find((u) => u.isBaseUnit) ??
                      product.units[0];
                    const price = baseUnit
                      ? product.sellingPriceBasePence *
                        baseUnit.conversionToBase
                      : product.sellingPriceBasePence;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addNewLine(product)}
                        className="flex w-full items-center gap-3 p-3 text-left hover:bg-emerald-50 transition-colors"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">
                            {product.name}
                          </div>
                          <div className="text-xs text-black/50">
                            {product.onHandBase > 0
                              ? `${product.onHandBase} in stock`
                              : 'Out of stock'}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-black/70">
                          {formatMoney(price, currency)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Summary & save */}
        {hasAmendChanges && (
          <div className="card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-black/70">
              Amendment Summary
            </h3>
            <div className="grid gap-3 grid-cols-2">
              <div className="rounded-xl bg-black/5 p-3">
                <div className="text-xs text-black/50">Original</div>
                <div className="text-sm font-semibold">
                  {formatMoney(saleTotal(amending.sale), currency)}
                </div>
              </div>
              <div className="rounded-xl bg-blue-50 p-3">
                <div className="text-xs text-blue-600">New Total</div>
                <div className="text-sm font-semibold text-blue-700">
                  {formatMoney(newTotal, currency)}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={saveAmend}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Amendment'}
            </button>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-black/80 px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </div>
        )}
      </div>
    );
  }

  /* ---- Pending sales list ---- */
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Pending Offline Sales</h1>
          <p className="text-sm text-black/50">
            {sales.length === 0
              ? 'No pending sales to sync.'
              : `${sales.length} sale${sales.length !== 1 ? 's' : ''} waiting to sync.`}
          </p>
        </div>
        <Link href="/pos" className="btn-ghost text-sm">
          ← Back to POS
        </Link>
      </div>

      {sales.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <svg
              className="h-7 w-7 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div className="text-sm font-semibold text-black/70">
            All sales synced
          </div>
          <div className="mt-1 text-xs text-black/40">
            There are no offline sales waiting to be uploaded.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sales.map((sale) => {
            const total = saleTotal(sale);
            const itemCount = sale.lines.length;
            return (
              <div
                key={sale.id}
                className="card flex items-center gap-4 p-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">
                    {formatMoney(total, currency)}
                    <span className="ml-2 text-xs font-normal text-black/50">
                      {itemCount} item{itemCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="text-xs text-black/40">
                    {new Date(sale.createdAt).toLocaleString()}
                    {sale.customerId && ' · Has customer'}
                  </div>
                  <div className="mt-1 flex gap-1 flex-wrap">
                    {sale.lines.slice(0, 3).map((line, i) => (
                      <span
                        key={i}
                        className="rounded bg-black/5 px-2 py-0.5 text-[11px] text-black/60"
                      >
                        {lineName(line)}
                      </span>
                    ))}
                    {sale.lines.length > 3 && (
                      <span className="rounded bg-black/5 px-2 py-0.5 text-[11px] text-black/40">
                        +{sale.lines.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => startAmend(sale.id)}
                  className="btn-ghost text-xs flex-none"
                >
                  Amend
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-black/80 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
