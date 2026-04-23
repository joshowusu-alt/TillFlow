'use client';

import { useState, useMemo } from 'react';
import { formatMoney } from '@/lib/format';
import { filterAmendSaleProductOptions } from '@/lib/amend-sale-product-options';
import { resolveEffectiveSellingPricePence } from '@/lib/services/shared';
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
  pluralName?: string;
  conversionToBase: number;
  isBaseUnit: boolean;
  sellingPricePence?: number | null;
  defaultCostPence?: number | null;
};

type AvailableProduct = {
  id: string;
  name: string;
  barcode: string | null;
  sellingPriceBasePence: number;
  vatRateBps: number;
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
  originalPricePence: number;
  unitPricePence: number;
  vatRateBps: number;
  lineSubtotalPence: number;
  lineVatPence: number;
  lineTotalPence: number;
  managerPin?: string;
};

type Props = {
  invoiceId: string;
  lines: LineItem[];
  totalPence: number;
  totalPaid: number;
  currency: string;
  vatEnabled: boolean;
  discountApprovalThresholdBps: number;
  availableProducts: AvailableProduct[];
};

export default function AmendSaleClient({
  invoiceId,
  lines,
  totalPence,
  totalPaid,
  currency,
  vatEnabled,
  discountApprovalThresholdBps,
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
  const [pendingProduct, setPendingProduct] = useState<AvailableProduct | null>(null);
  const [pendingUnitId, setPendingUnitId] = useState('');
  const [pendingPriceInput, setPendingPriceInput] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [pendingError, setPendingError] = useState<string | null>(null);

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

  // Filter products already added as new items or still kept on the invoice.
  const addedProductIds = useMemo(() => new Set(newItems.map((i) => i.productId)), [newItems]);
  const keptProductIds = useMemo(() => new Set(keptLines.map((line) => line.productId)), [keptLines]);

  const filteredProducts = useMemo<AvailableProduct[]>(() => {
    return filterAmendSaleProductOptions<AvailableProduct>(availableProducts, {
      keptProductIds,
      addedProductIds,
      searchQuery,
    });
  }, [availableProducts, keptProductIds, addedProductIds, searchQuery]);

  const toggleRemove = (lineId: string) => {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  };

  const parseMoneyToPence = (value: string) => {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  };

  const getLineTotals = (product: AvailableProduct, qtyInUnit: number, unitPricePence: number) => {
    const lineSubtotalPence = unitPricePence * qtyInUnit;
    const lineVatPence = vatEnabled ? Math.round((lineSubtotalPence * product.vatRateBps) / 10000) : 0;
    return {
      lineSubtotalPence,
      lineVatPence,
      lineTotalPence: lineSubtotalPence + lineVatPence,
    };
  };

  const selectProductForAdd = (product: AvailableProduct) => {
    const baseUnit = product.units.find((u) => u.isBaseUnit) ?? product.units[0];
    if (!baseUnit) return;
    const price = resolveEffectiveSellingPricePence(product, baseUnit);
    setPendingProduct(product);
    setPendingUnitId(baseUnit.id);
    setPendingPriceInput((price / 100).toFixed(2));
    setManagerPin('');
    setPendingError(null);
    setShowAddPanel(false);
    setSearchQuery('');
  };

  const pendingUnit = pendingProduct?.units.find((u) => u.id === pendingUnitId) ?? pendingProduct?.units[0] ?? null;
  const pendingOriginalPricePence = pendingProduct && pendingUnit
    ? resolveEffectiveSellingPricePence(pendingProduct, pendingUnit)
    : 0;
  const pendingOverridePricePence = parseMoneyToPence(pendingPriceInput);
  const pendingPriceDiffBps = pendingOriginalPricePence > 0
    ? Math.round((Math.abs(pendingOriginalPricePence - pendingOverridePricePence) * 10000) / pendingOriginalPricePence)
    : pendingOverridePricePence === pendingOriginalPricePence ? 0 : Number.POSITIVE_INFINITY;
  const pendingRequiresPin = pendingPriceDiffBps > discountApprovalThresholdBps;

  const changePendingUnit = (unitId: string) => {
    if (!pendingProduct) return;
    const unit = pendingProduct.units.find((u) => u.id === unitId);
    if (!unit) return;
    const price = resolveEffectiveSellingPricePence(pendingProduct, unit);
    setPendingUnitId(unit.id);
    setPendingPriceInput((price / 100).toFixed(2));
    setManagerPin('');
    setPendingError(null);
  };

  const confirmPendingProduct = () => {
    if (!pendingProduct) return;
    const unit = pendingProduct.units.find((u) => u.id === pendingUnitId) ?? pendingProduct.units[0];
    if (!unit) return;
    const priceNum = parseMoneyToPence(pendingPriceInput);
    if (priceNum <= 0) {
      setPendingError('Enter a valid unit price.');
      return;
    }
    const originalPricePence = resolveEffectiveSellingPricePence(pendingProduct, unit);
    const priceDiffBps = originalPricePence > 0
      ? Math.round((Math.abs(originalPricePence - priceNum) * 10000) / originalPricePence)
      : priceNum === originalPricePence ? 0 : Number.POSITIVE_INFINITY;
    const requiresPin = priceDiffBps > discountApprovalThresholdBps;
    if (requiresPin && !managerPin.trim()) {
      setPendingError('Manager PIN required for this price change.');
      return;
    }
    const totals = getLineTotals(pendingProduct, 1, priceNum);
    setNewItems((prev) => [
      ...prev,
      {
        productId: pendingProduct.id,
        productName: pendingProduct.name,
        unitId: unit.id,
        unitName: unit.name,
        qtyInUnit: 1,
        originalPricePence,
        unitPricePence: priceNum,
        vatRateBps: pendingProduct.vatRateBps,
        ...totals,
        managerPin: requiresPin ? managerPin.trim() : undefined,
      },
    ]);
    setPendingProduct(null);
    setPendingUnitId('');
    setPendingPriceInput('');
    setManagerPin('');
    setPendingError(null);
  };

  const updateNewItemQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setNewItems((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    setNewItems((prev) =>
      prev.map((i) =>
        i.productId === productId
          ? {
              ...i,
              qtyInUnit: qty,
              lineSubtotalPence: i.unitPricePence * qty,
              lineVatPence: vatEnabled ? Math.round((i.unitPricePence * qty * i.vatRateBps) / 10000) : 0,
              lineTotalPence:
                i.unitPricePence * qty +
                (vatEnabled ? Math.round((i.unitPricePence * qty * i.vatRateBps) / 10000) : 0),
            }
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
            unitPricePence: i.unitPricePence,
            managerPin: i.managerPin,
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
                    className={`flex-none rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isRemoved
                        ? 'bg-rose-600 text-white hover:bg-rose-700'
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
          {keptLines.length === 0 && newItems.length === 0 && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Add at least one replacement item before you confirm this amendment. If the whole sale should be cancelled instead, use Return or Owner Void.
            </p>
          )}
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
                    <div className="text-xs text-black/50">
                      {item.unitName} @ {formatMoney(item.unitPricePence, currency)}
                      {item.unitPricePence !== item.originalPricePence ? (
                        <span className="ml-1 text-amber-700">
                          was {formatMoney(item.originalPricePence, currency)}
                        </span>
                      ) : null}
                    </div>
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
                        ? resolveEffectiveSellingPricePence(product, baseUnit)
                        : product.sellingPriceBasePence;
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => selectProductForAdd(product)}
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

          {pendingProduct && pendingUnit ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-ink">{pendingProduct.name}</div>
                  <div className="mt-1 text-xs text-black/50">
                    {pendingProduct.categoryName ?? 'Uncategorised'} · {pendingProduct.onHandBase} base units in stock
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => {
                    setPendingProduct(null);
                    setPendingUnitId('');
                    setPendingPriceInput('');
                    setManagerPin('');
                    setPendingError(null);
                  }}
                >
                  Cancel
                </button>
              </div>

              {pendingProduct.units.length > 1 ? (
                <div className="mt-3">
                  <div className="label">Unit</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {pendingProduct.units.map((unit) => (
                      <button
                        key={unit.id}
                        type="button"
                        onClick={() => changePendingUnit(unit.id)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          pendingUnitId === unit.id
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white text-black/60 hover:bg-black/5'
                        }`}
                      >
                        {unit.name} ({unit.conversionToBase}x)
                        <span className={pendingUnitId === unit.id ? 'ml-1 text-white/70' : 'ml-1 text-black/35'}>
                          {Math.floor(pendingProduct.onHandBase / Math.max(unit.conversionToBase, 1))} in stock
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-xs text-black/55">
                  Unit: <span className="font-semibold text-ink">{pendingUnit.name}</span>
                </div>
              )}

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Unit price</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={pendingPriceInput}
                    onChange={(e) => {
                      setPendingPriceInput(e.target.value);
                      setPendingError(null);
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <div className="mt-1 text-xs text-black/50">
                    Standard price: {formatMoney(pendingOriginalPricePence, currency)}
                  </div>
                </div>
                {pendingRequiresPin ? (
                  <div>
                    <label className="label">Manager PIN required for this price change</label>
                    <input
                      className="input"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={managerPin}
                      onChange={(e) => {
                        setManagerPin(e.target.value);
                        setPendingError(null);
                      }}
                      placeholder="Enter approval PIN"
                    />
                  </div>
                ) : null}
              </div>

              {pendingError ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {pendingError}
                </div>
              ) : null}

              <button
                type="button"
                className="btn-primary mt-4"
                onClick={confirmPendingProduct}
                disabled={pendingRequiresPin && !managerPin.trim()}
              >
                Add item
              </button>
            </div>
          ) : null}
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
            {keptLines.length === 0 && newItems.length === 0 && (
              <p className="mb-3 text-sm text-amber-700">
                Add a replacement item before confirming this amendment.
              </p>
            )}
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
        <div className="overlay-shell fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]">
            <div className="overflow-y-auto flex-1 p-6">
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
            </div>

            <div className="flex flex-col gap-3 px-6 pb-6 pt-3 border-t border-black/10">
              <button
                type="button"
                className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Processing…' : 'Confirm Amendment'}
              </button>
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => setShowConfirm(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
