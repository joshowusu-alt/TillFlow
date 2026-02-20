'use client';

import { useState, useMemo } from 'react';
import { formatMoney } from '@/lib/format';
import { amendSaleAction } from '@/app/actions/sales';

type LineItem = {
  id: string;
  productId: string;
  productName: string;
  unitName: string;
  qtyInUnit: number;
  unitPricePence: number;
  lineDiscountPence: number;
  promoDiscountPence: number;
  lineTotalPence: number;
  lineVatPence: number;
};

type ProductUnit = {
  id: string;
  name: string;
  conversionToBase: number;
  isBaseUnit: boolean;
};

type AvailableProduct = {
  id: string;
  name: string;
  barcode: string | null;
  sellingPriceBasePence: number;
  categoryName: string | null;
  imageUrl: string | null;
  onHandBase: number;
  units: ProductUnit[];
};

type NewLineItem = {
  productId: string;
  productName: string;
  unitId: string;
  unitName: string;
  qtyInUnit: number;
  unitPricePence: number;
  lineTotalPence: number;
};

type Props = {
  invoiceId: string;
  lines: LineItem[];
  totalPence: number;
  totalPaid: number;
  currency: string;
  availableProducts: AvailableProduct[];
};

export default function AmendSaleClient({
  invoiceId,
  lines,
  totalPence,
  totalPaid,
  currency,
  availableProducts,
}: Props) {
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [newItems, setNewItems] = useState<NewLineItem[]>([]);
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('CASH');
  const [additionalPaymentMethod, setAdditionalPaymentMethod] = useState('CASH');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'remove' | 'add'>('remove');

  const keptLines = lines.filter((l) => !removedIds.has(l.id));
  const removedLines = lines.filter((l) => removedIds.has(l.id));

  // Calculate totals
  const keptTotal = keptLines.reduce((sum, l) => sum + l.lineTotalPence, 0);
  const addedTotal = newItems.reduce((sum, l) => sum + l.lineTotalPence, 0);
  const removedTotal = removedLines.reduce((sum, l) => sum + l.lineTotalPence, 0);
  const newTotal = keptTotal + addedTotal;
  const refundAmount = Math.max(totalPaid - newTotal, 0);
  const additionalPaymentNeeded = Math.max(newTotal - totalPaid, 0);

  const hasChanges = removedIds.size > 0 || newItems.length > 0;
  const canSubmit = hasChanges && (keptLines.length > 0 || newItems.length > 0);

  // Filter products already added as new items
  const addedProductIds = useMemo(() => new Set(newItems.map((i) => i.productId)), [newItems]);

  const filteredProducts = useMemo(() => {
    let filtered = availableProducts.filter((p) => !addedProductIds.has(p.id));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          (p.categoryName && p.categoryName.toLowerCase().includes(q))
      );
    }
    return filtered.slice(0, 20); // Limit for performance
  }, [availableProducts, addedProductIds, searchQuery]);

  const toggleRemove = (lineId: string) => {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        // Don't allow removing all items if no new items added
        if (keptLines.length <= 1 && !prev.has(lineId) && newItems.length === 0) return prev;
        next.add(lineId);
      }
      return next;
    });
  };

  const addProduct = (product: AvailableProduct) => {
    const baseUnit = product.units.find((u) => u.isBaseUnit) ?? product.units[0];
    if (!baseUnit) return;

    const unitPricePence = product.sellingPriceBasePence * baseUnit.conversionToBase;
    setNewItems((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        unitId: baseUnit.id,
        unitName: baseUnit.name,
        qtyInUnit: 1,
        unitPricePence,
        lineTotalPence: unitPricePence,
      },
    ]);
    setSearchQuery('');
    setShowAddPanel(false);
  };

  const updateNewItemQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setNewItems((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    setNewItems((prev) =>
      prev.map((i) =>
        i.productId === productId
          ? { ...i, qtyInUnit: qty, lineTotalPence: i.unitPricePence * qty }
          : i
      )
    );
  };

  const removeNewItem = (productId: string) => {
    setNewItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const keepLineIds = lines.filter((l) => !removedIds.has(l.id)).map((l) => l.id);
    const formData = new FormData();
    formData.set('salesInvoiceId', invoiceId);
    formData.set('keepLineIds', JSON.stringify(keepLineIds));
    formData.set('reason', reason || 'Sale amended');
    formData.set('refundMethod', refundMethod);
    formData.set('additionalPaymentMethod', additionalPaymentMethod);
    if (newItems.length > 0) {
      formData.set(
        'newLines',
        JSON.stringify(
          newItems.map((i) => ({
            productId: i.productId,
            unitId: i.unitId,
            qtyInUnit: i.qtyInUnit,
          }))
        )
      );
    }
    await amendSaleAction(formData);
  };

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-black/5 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('remove')}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'remove'
              ? 'bg-white text-black shadow-sm'
              : 'text-black/50 hover:text-black/70'
          }`}
        >
          Current Items ({lines.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('add')}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'add'
              ? 'bg-white text-black shadow-sm'
              : 'text-black/50 hover:text-black/70'
          }`}
        >
          Add Items {newItems.length > 0 && `(${newItems.length})`}
        </button>
      </div>

      {/* Remove items tab */}
      {activeTab === 'remove' && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-black/70 mb-4">
            Tap &quot;Remove&quot; on items to take off this sale
          </h3>
          <div className="space-y-2">
            {lines.map((line) => {
              const isRemoved = removedIds.has(line.id);
              const isLastKept = !isRemoved && keptLines.length === 1 && newItems.length === 0;
              return (
                <div
                  key={line.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                    isRemoved
                      ? 'border-rose-300 bg-rose-50'
                      : 'border-black/10 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleRemove(line.id)}
                    disabled={isLastKept}
                    className={`flex-none rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isRemoved
                        ? 'bg-rose-600 text-white hover:bg-rose-700'
                        : isLastKept
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-black/5 text-black/70 hover:bg-rose-100 hover:text-rose-700'
                    }`}
                  >
                    {isRemoved ? 'Undo' : 'Remove'}
                  </button>
                  <div className={`flex-1 min-w-0 ${isRemoved ? 'line-through opacity-50' : ''}`}>
                    <div className="text-sm font-semibold truncate">{line.productName}</div>
                    <div className="text-xs text-black/50">
                      {line.qtyInUnit} × {line.unitName}
                    </div>
                  </div>
                  <div className={`text-sm font-semibold ${isRemoved ? 'line-through opacity-50' : ''}`}>
                    {formatMoney(line.lineTotalPence, currency)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add items tab */}
      {activeTab === 'add' && (
        <div className="card p-6 space-y-4">
          {/* Added items list */}
          {newItems.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-black/70">Items to add</h3>
              {newItems.map((item) => (
                <div
                  key={item.productId}
                  className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3"
                >
                  <button
                    type="button"
                    onClick={() => removeNewItem(item.productId)}
                    className="flex-none rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-200 transition-colors"
                  >
                    Remove
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{item.productName}</div>
                    <div className="text-xs text-black/50">{item.unitName}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateNewItemQty(item.productId, item.qtyInUnit - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/5 text-sm font-bold hover:bg-black/10 transition-colors"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-semibold">{item.qtyInUnit}</span>
                    <button
                      type="button"
                      onClick={() => updateNewItemQty(item.productId, item.qtyInUnit + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/5 text-sm font-bold hover:bg-black/10 transition-colors"
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

          {/* Search and add */}
          <div>
            <div className="relative">
              <input
                type="text"
                className="input w-full pl-9"
                placeholder="Search products by name or barcode…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowAddPanel(true);
                }}
                onFocus={() => setShowAddPanel(true)}
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            {showAddPanel && (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-black/10 bg-white">
                {filteredProducts.length === 0 ? (
                  <div className="p-4 text-center text-sm text-black/50">
                    {searchQuery ? 'No products found' : 'No more products available'}
                  </div>
                ) : (
                  <div className="divide-y divide-black/5">
                    {filteredProducts.map((product) => {
                      const baseUnit = product.units.find((u) => u.isBaseUnit) ?? product.units[0];
                      const price = baseUnit
                        ? product.sellingPriceBasePence * baseUnit.conversionToBase
                        : product.sellingPriceBasePence;
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addProduct(product)}
                          className="flex w-full items-center gap-3 p-3 text-left hover:bg-emerald-50 transition-colors"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold truncate">{product.name}</div>
                            <div className="text-xs text-black/50">
                              {product.categoryName ?? 'Uncategorised'}
                              {product.onHandBase > 0 && ` · ${product.onHandBase} in stock`}
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
        </div>
      )}

      {/* Summary */}
      {hasChanges && (
        <div className="card p-6 space-y-3">
          <h3 className="text-sm font-semibold text-black/70">Amendment Summary</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-black/5 p-3">
              <div className="text-xs text-black/50">Original Total</div>
              <div className="text-sm font-semibold">{formatMoney(totalPence, currency)}</div>
            </div>
            {removedTotal > 0 && (
              <div className="rounded-xl bg-rose-50 p-3">
                <div className="text-xs text-rose-600">Removed Items</div>
                <div className="text-sm font-semibold text-rose-700">
                  −{formatMoney(removedTotal, currency)}
                </div>
              </div>
            )}
            {addedTotal > 0 && (
              <div className="rounded-xl bg-emerald-50 p-3">
                <div className="text-xs text-emerald-600">Added Items</div>
                <div className="text-sm font-semibold text-emerald-700">
                  +{formatMoney(addedTotal, currency)}
                </div>
              </div>
            )}
            <div className="rounded-xl bg-blue-50 p-3">
              <div className="text-xs text-blue-600">New Total</div>
              <div className="text-sm font-semibold text-blue-700">{formatMoney(newTotal, currency)}</div>
            </div>
            {refundAmount > 0 && (
              <div className="rounded-xl bg-accentSoft p-3">
                <div className="text-xs text-accent">Refund Due</div>
                <div className="text-sm font-semibold text-accent">{formatMoney(refundAmount, currency)}</div>
              </div>
            )}
            {additionalPaymentNeeded > 0 && (
              <div className="rounded-xl bg-amber-50 p-3">
                <div className="text-xs text-amber-600">Additional Payment</div>
                <div className="text-sm font-semibold text-amber-700">
                  +{formatMoney(additionalPaymentNeeded, currency)}
                </div>
              </div>
            )}
          </div>

          {/* Payment method & reason */}
          <div className="grid gap-4 md:grid-cols-2 pt-2">
            {refundAmount > 0 && (
              <div>
                <label className="label">Refund Method</label>
                <select
                  className="input"
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                >
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                </select>
              </div>
            )}
            {additionalPaymentNeeded > 0 && (
              <div>
                <label className="label">Payment Method for Extra</label>
                <select
                  className="input"
                  value={additionalPaymentMethod}
                  onChange={(e) => setAdditionalPaymentMethod(e.target.value)}
                >
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                </select>
              </div>
            )}
            <div className={refundAmount > 0 || additionalPaymentNeeded > 0 ? '' : 'md:col-span-2'}>
              <label className="label">Reason for Amendment</label>
              <input
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Customer added/removed items"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              className="btn-primary"
              disabled={!canSubmit}
              onClick={() => setShowConfirm(true)}
            >
              Review & Confirm Amendment
            </button>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold">Confirm Amendment</h3>
                <p className="text-sm text-black/60">This action cannot be undone.</p>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              {removedLines.length > 0 && (
                <>
                  <div className="font-semibold text-black/70">Items to remove:</div>
                  {removedLines.map((line) => (
                    <div key={line.id} className="flex justify-between rounded-lg bg-rose-50 px-3 py-2">
                      <span className="text-rose-800">
                        {line.qtyInUnit}× {line.productName}
                      </span>
                      <span className="font-semibold text-rose-700">
                        −{formatMoney(line.lineTotalPence, currency)}
                      </span>
                    </div>
                  ))}
                </>
              )}
              {newItems.length > 0 && (
                <>
                  <div className="font-semibold text-black/70 pt-1">Items to add:</div>
                  {newItems.map((item) => (
                    <div key={item.productId} className="flex justify-between rounded-lg bg-emerald-50 px-3 py-2">
                      <span className="text-emerald-800">
                        {item.qtyInUnit}× {item.productName}
                      </span>
                      <span className="font-semibold text-emerald-700">
                        +{formatMoney(item.lineTotalPence, currency)}
                      </span>
                    </div>
                  ))}
                </>
              )}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>New Total</span>
                <span>{formatMoney(newTotal, currency)}</span>
              </div>
              {refundAmount > 0 && (
                <div className="flex justify-between text-accent font-semibold">
                  <span>Refund ({refundMethod})</span>
                  <span>{formatMoney(refundAmount, currency)}</span>
                </div>
              )}
              {additionalPaymentNeeded > 0 && (
                <div className="flex justify-between text-amber-700 font-semibold">
                  <span>Extra Payment ({additionalPaymentMethod})</span>
                  <span>+{formatMoney(additionalPaymentNeeded, currency)}</span>
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className="btn-ghost flex-1"
                onClick={() => setShowConfirm(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Processing…' : 'Confirm Amendment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
