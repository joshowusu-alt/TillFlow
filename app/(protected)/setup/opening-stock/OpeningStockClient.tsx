'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { formatMoney } from '@/lib/format';
import { createOpeningStockAction } from '@/app/actions/opening-stock';
import type { OpeningStockResult } from '@/app/actions/opening-stock';

type UnitOption = {
  unitId: string;
  unit: { id: string; name: string };
  isBaseUnit: boolean;
};

type ProductDto = {
  id: string;
  name: string;
  barcode: string | null;
  defaultCostBasePence: number;
  productUnits: UnitOption[];
};

type CartLine = {
  id: string;
  productId: string;
  unitId: string;
  qty: string;
  cost: string;
};

export default function OpeningStockClient({
  products,
  currency,
  existingCapitalPence,
}: {
  products: ProductDto[];
  currency: string;
  existingCapitalPence: number;
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cashInput, setCashInput] = useState(
    existingCapitalPence > 0 ? String(existingCapitalPence / 100) : ''
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OpeningStockResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const addRow = () => {
    const first = products[0];
    if (!first) return;
    const firstUnit = first.productUnits[0];
    setCart(prev => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2),
        productId: first.id,
        unitId: firstUnit?.unitId ?? '',
        qty: '1',
        cost:
          first.defaultCostBasePence > 0
            ? String(first.defaultCostBasePence / 100)
            : '',
      },
    ]);
  };

  const updateRow = (id: string, field: keyof CartLine, value: string) => {
    setCart(prev =>
      prev.map(row => {
        if (row.id !== id) return row;
        if (field === 'productId') {
          const prod = products.find(p => p.id === value);
          const firstUnit = prod?.productUnits[0];
          return {
            ...row,
            productId: value,
            unitId: firstUnit?.unitId ?? '',
            cost:
              prod && prod.defaultCostBasePence > 0
                ? String(prod.defaultCostBasePence / 100)
                : '',
          };
        }
        return { ...row, [field]: value };
      })
    );
  };

  const removeRow = (id: string) =>
    setCart(prev => prev.filter(r => r.id !== id));

  const inventoryValuePence = cart.reduce((sum, row) => {
    const qty = parseFloat(row.qty) || 0;
    const cost = parseFloat(row.cost) || 0;
    return sum + Math.round(qty * cost * 100);
  }, 0);

  const cashAmountPence = Math.round((parseFloat(cashInput) || 0) * 100);
  const totalCapitalPence = inventoryValuePence + cashAmountPence;

  const handleSubmit = () => {
    setError(null);
    if (cart.length === 0 && cashAmountPence === 0) {
      setError('Add at least one stock item or enter a cash amount to continue.');
      return;
    }
    const lines = cart
      .filter(r => parseFloat(r.qty) > 0)
      .map(r => ({
        productId: r.productId,
        unitId: r.unitId,
        qtyInUnit: parseFloat(r.qty),
        unitCostPence: Math.round(parseFloat(r.cost) * 100),
      }));

    startTransition(async () => {
      const res = await createOpeningStockAction(lines, cashAmountPence);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setResult((res as { success: true; data: OpeningStockResult }).data);
    });
  };

  /* ── Success screen ── */
  if (result) {
    return (
      <div className="card p-8 text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <svg
            className="h-8 w-8 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold">Opening capital recorded!</h2>
          <p className="mt-1 text-sm text-black/50">
            Your Balance Sheet now reflects your starting position.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-left">
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <div className="text-xs text-black/50">Stock value</div>
            <div className="text-lg font-semibold">
              {formatMoney(result.inventoryValuePence, currency)}
            </div>
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <div className="text-xs text-black/50">Cash on hand</div>
            <div className="text-lg font-semibold">
              {formatMoney(result.cashPence, currency)}
            </div>
          </div>
          <div className="rounded-xl border border-accent/20 bg-accentSoft/30 p-4">
            <div className="text-xs text-black/50">Total capital</div>
            <div className="text-lg font-bold text-accent">
              {formatMoney(result.totalPence, currency)}
            </div>
          </div>
        </div>
        <div className="flex gap-3 justify-center">
          <Link href="/reports/balance-sheet" className="btn-primary">
            View Balance Sheet →
          </Link>
          <Link href="/onboarding" className="btn-ghost border border-black/10">
            Back to Setup
          </Link>
        </div>
      </div>
    );
  }

  /* ── Entry form ── */
  return (
    <div className="space-y-4">
      {/* Stock section */}
      <div className="card p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">
              Step 1 — Existing stock
            </h2>
            <p className="text-xs text-black/50 mt-0.5">
              Add every product you currently have on the shelf and its cost
              price.
            </p>
          </div>
          {inventoryValuePence > 0 && (
            <div className="flex-shrink-0 text-sm font-semibold text-accent">
              {formatMoney(inventoryValuePence, currency)}
            </div>
          )}
        </div>

        {products.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No products found.{' '}
            <Link href="/products" className="underline font-medium">
              Add your products first
            </Link>
            , then come back here.
          </div>
        ) : cart.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-black/10 py-8 text-center">
            <p className="text-sm text-black/40 mb-3">No items added yet</p>
            <button
              type="button"
              onClick={addRow}
              className="btn-secondary text-sm"
            >
              + Add stock item
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Column headers */}
            <div className="grid grid-cols-12 gap-2 px-1">
              <div className="col-span-4 text-xs font-medium text-black/40 uppercase tracking-wide">
                Product
              </div>
              <div className="col-span-2 text-xs font-medium text-black/40 uppercase tracking-wide">
                Unit
              </div>
              <div className="col-span-2 text-xs font-medium text-black/40 uppercase tracking-wide">
                Qty
              </div>
              <div className="col-span-3 text-xs font-medium text-black/40 uppercase tracking-wide">
                Cost ({currency})
              </div>
            </div>

            {cart.map(row => {
              const prod = products.find(p => p.id === row.productId);
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-12 gap-2 items-center"
                >
                  <div className="col-span-4">
                    <select
                      className="input text-sm"
                      value={row.productId}
                      onChange={e =>
                        updateRow(row.id, 'productId', e.target.value)
                      }
                    >
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <select
                      className="input text-sm"
                      value={row.unitId}
                      onChange={e =>
                        updateRow(row.id, 'unitId', e.target.value)
                      }
                    >
                      {(prod?.productUnits ?? []).map(pu => (
                        <option key={pu.unitId} value={pu.unitId}>
                          {pu.unit.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input
                      className="input text-sm"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Qty"
                      value={row.qty}
                      onChange={e => updateRow(row.id, 'qty', e.target.value)}
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      className="input text-sm"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={row.cost}
                      onChange={e =>
                        updateRow(row.id, 'cost', e.target.value)
                      }
                    />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="text-black/30 hover:text-rose-500 transition"
                    >
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={addRow}
              className="text-sm text-accent hover:underline pt-1"
            >
              + Add another item
            </button>
          </div>
        )}

      </div>

      {/* Cash section */}
      <div className="card p-6 space-y-3">
        <h2 className="text-base font-semibold">Step 2 — Cash on hand</h2>
        <p className="text-xs text-black/50">
          How much cash do you have in the till right now?
        </p>
        <div className="max-w-xs">
          <label className="label">Cash ({currency})</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 500.00"
            value={cashInput}
            onChange={e => setCashInput(e.target.value)}
          />
        </div>
      </div>

      {/* Live summary */}
      {totalCapitalPence > 0 && (
        <div className="rounded-2xl border border-accent/20 bg-accentSoft/30 p-5 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-accent">
            Opening Capital Summary
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-black/50">Stock value</div>
              <div className="font-semibold">
                {formatMoney(inventoryValuePence, currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-black/50">Cash on hand</div>
              <div className="font-semibold">
                {formatMoney(cashAmountPence, currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-black/50">Total capital</div>
              <div className="text-lg font-bold text-accent">
                {formatMoney(totalCapitalPence, currency)}
              </div>
            </div>
          </div>
          <p className="text-xs text-black/40">
            Stock is recorded as inventory (Accounts Payable owed to owner).
            Cash is recorded as Owner&apos;s Capital. Together they are your
            opening capital.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="btn-primary flex-1 py-3 disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save Opening Capital'}
        </button>
        <Link
          href="/onboarding"
          className="btn-ghost border border-black/10 px-6 py-3 text-sm text-center"
        >
          Skip for now
        </Link>
      </div>
    </div>
  );
}
