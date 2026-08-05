'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SubmitButton from '@/components/SubmitButton';
import { createStockAdjustmentAction } from '@/app/actions/inventory';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import type { InventoryDecreaseReasonCode } from '@/lib/services/inventory-decrease';
import type { InventoryIncreaseReasonCode } from '@/lib/services/inventory-increase';

type UnitDto = {
  id: string;
  name: string;
  pluralName: string;
  conversionToBase: number;
  isBaseUnit: boolean;
};

type ProductDto = {
  id: string;
  name: string;
  units: UnitDto[];
  onHandBase: number;
  avgCostBasePence: number;
};

type Mode = 'DECREASE' | 'INCREASE';

const DECREASE_REASON_OPTIONS: { code: InventoryDecreaseReasonCode; label: string }[] = [
  { code: 'WASTAGE', label: 'Wastage' },
  { code: 'EXPIRED', label: 'Expired' },
  { code: 'DAMAGED', label: 'Damaged' },
  { code: 'THEFT', label: 'Theft' },
  { code: 'STOCKTAKE_SHORTFALL', label: 'Stocktake shortfall' },
  { code: 'AUTHORISED_QUANTITY_CORRECTION', label: 'Authorised quantity correction' },
];

const INCREASE_REASON_OPTIONS: { code: InventoryIncreaseReasonCode; label: string }[] = [
  { code: 'PHYSICAL_COUNT_SURPLUS', label: 'Physical count surplus' },
  { code: 'STOCK_FOUND', label: 'Stock found' },
];

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `adj-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatPence(pence: number, currency: string) {
  const amount = (pence / 100).toFixed(2);
  return `${currency} ${amount}`;
}

export default function StockAdjustmentClient({
  storeId,
  storeName,
  currency,
  products,
  phase1Enabled,
  phase2Enabled,
  actorRole,
}: {
  storeId: string;
  storeName: string;
  currency: string;
  products: ProductDto[];
  phase1Enabled: boolean;
  phase2Enabled: boolean;
  actorRole: string;
}) {
  const defaultMode: Mode | null = phase1Enabled
    ? 'DECREASE'
    : phase2Enabled
      ? 'INCREASE'
      : null;
  const [mode, setMode] = useState<Mode | null>(defaultMode);
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [unitId, setUnitId] = useState(products[0]?.units[0]?.id ?? '');
  const [qtyInput, setQtyInput] = useState('1');
  const [decreaseReasonCode, setDecreaseReasonCode] =
    useState<InventoryDecreaseReasonCode>('WASTAGE');
  const [increaseReasonCode, setIncreaseReasonCode] =
    useState<InventoryIncreaseReasonCode>('PHYSICAL_COUNT_SURPLUS');
  const [reason, setReason] = useState('Wastage');
  const [productSearch, setProductSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [confirmIncrease, setConfirmIncrease] = useState(false);
  const [correctsAdjustmentId, setCorrectsAdjustmentId] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIdempotencyKey(newIdempotencyKey());
    setConfirmIncrease(false);
  }, [productId, unitId, qtyInput, decreaseReasonCode, increaseReasonCode, reason, mode, correctsAdjustmentId]);

  const selectProduct = useCallback((id: string) => {
    setProductId(id);
    const product = products.find((item) => item.id === id);
    const base = product?.units.find((unit) => unit.isBaseUnit) ?? product?.units[0];
    setUnitId(base?.id ?? '');
    setProductSearch(product?.name ?? '');
    setShowDropdown(false);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, productSearch]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId),
    [products, productId],
  );
  const unitsForProduct = selectedProduct?.units ?? [];
  const selectedUnit = unitsForProduct.find((unit) => unit.id === unitId);
  const qtyNumber = Math.max(0, Math.floor(Number(qtyInput) || 0));
  const qtyBase = selectedUnit ? qtyNumber * selectedUnit.conversionToBase : 0;
  const avgCost = selectedProduct?.avgCostBasePence ?? 0;
  const valueIncrease = qtyBase > 0 && avgCost > 0 ? qtyBase * avgCost : 0;
  const resultingQty = (selectedProduct?.onHandBase ?? 0) + qtyBase;
  const isOwner = actorRole === 'OWNER';

  const onHandLabel = useMemo(() => {
    if (!selectedProduct) return '';
    const baseUnit = selectedProduct.units.find((unit) => unit.isBaseUnit);
    const packaging = getPrimaryPackagingUnit(
      selectedProduct.units.map((unit) => ({ conversionToBase: unit.conversionToBase, unit })),
    );
    return formatMixedUnit({
      qtyBase: selectedProduct.onHandBase,
      baseUnit: baseUnit?.name ?? 'unit',
      baseUnitPlural: baseUnit?.pluralName,
      packagingUnit: packaging?.unit.name,
      packagingUnitPlural: packaging?.unit.pluralName,
      packagingConversion: packaging?.conversionToBase,
    });
  }, [selectedProduct]);

  if (!phase1Enabled && !phase2Enabled) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-900">
        <div className="font-semibold">Inventory adjustments are not enabled</div>
        <p className="mt-1 text-amber-800/80">
          Phase 1 decreases and Phase 2 increases are gated behind rollout flags. Adjustments are
          unavailable until a flag is enabled — legacy unhardened adjustments cannot be used as a
          bypass.
        </p>
      </div>
    );
  }

  return (
    <form action={createStockAdjustmentAction} className="space-y-5">
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="direction" value={mode ?? ''} />
      <input
        type="hidden"
        name="reasonCode"
        value={mode === 'INCREASE' ? increaseReasonCode : decreaseReasonCode}
      />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {isOwner && correctsAdjustmentId.trim() ? (
        <input type="hidden" name="correctsAdjustmentId" value={correctsAdjustmentId.trim()} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {phase1Enabled ? (
          <button
            type="button"
            onClick={() => {
              setMode('DECREASE');
              setDecreaseReasonCode('WASTAGE');
              setReason('Wastage');
            }}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              mode === 'DECREASE'
                ? 'border-rose-400 bg-rose-100 text-rose-800'
                : 'border-black/10 bg-white text-black/70 hover:border-rose-300'
            }`}
          >
            Record decrease
          </button>
        ) : null}
        {phase2Enabled ? (
          <button
            type="button"
            onClick={() => {
              setMode('INCREASE');
              setIncreaseReasonCode('PHYSICAL_COUNT_SURPLUS');
              setReason('Physical count surplus');
            }}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              mode === 'INCREASE'
                ? 'border-emerald-400 bg-emerald-100 text-emerald-800'
                : 'border-black/10 bg-white text-black/70 hover:border-emerald-300'
            }`}
          >
            Record increase
          </button>
        ) : null}
      </div>

      {!mode ? (
        <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-4 text-sm text-black/60">
          Choose Record decrease or Record increase to continue.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-4 sm:p-5">
            <div className="mb-4">
              <div className="text-xs uppercase tracking-[0.2em] text-black/40">
                {mode === 'INCREASE' ? 'Increase details' : 'Decrease details'}
              </div>
              <div className="mt-1 text-sm text-black/60">
                {mode === 'INCREASE'
                  ? 'Use Record increase only for a confirmed physical-count surplus or stock genuinely found. Supplier deliveries, customer returns, transfers, sale mistakes, and opening balances belong in their own workflows.'
                  : 'Record wastage, damage, theft, expiry, stocktake shortfall, or an authorised quantity correction.'}
              </div>
            </div>

            {mode === 'INCREASE' ? (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-3 text-xs text-emerald-900">
                <div className="font-semibold">Not an inventory increase if:</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>Supplier delivery → Purchase / stock receipt</li>
                  <li>Customer return → Return / refund</li>
                  <li>Store movement → Stock transfer</li>
                  <li>Incorrect sale → Void / amend / refund</li>
                  <li>Incorrect previous adjustment → Owner-only opposite compensating entry</li>
                </ul>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="relative sm:col-span-2 xl:col-span-1" ref={dropdownRef}>
                <label className="label">Product</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Type to search products…"
                  value={showDropdown ? productSearch : (selectedProduct?.name ?? '')}
                  onFocus={() => {
                    setProductSearch('');
                    setShowDropdown(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowDropdown(false), 200);
                  }}
                  onChange={(event) => {
                    setProductSearch(event.target.value);
                    setShowDropdown(true);
                  }}
                />
                {showDropdown && (
                  <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-black/10 bg-white shadow-lg">
                    {filteredProducts.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-black/40">No products match</li>
                    ) : (
                      filteredProducts.map((product) => (
                        <li
                          key={product.id}
                          className={`cursor-pointer px-3 py-2 text-sm hover:bg-black/5 ${product.id === productId ? 'bg-black/[0.03] font-semibold' : ''}`}
                          onMouseDown={() => selectProduct(product.id)}
                        >
                          {product.name}
                        </li>
                      ))
                    )}
                  </ul>
                )}
                {onHandLabel ? (
                  <div className="mt-1 text-xs text-black/50">On hand: {onHandLabel}</div>
                ) : null}
              </div>
              <div>
                <label className="label">Store</label>
                <div className="input bg-black/[0.02] text-black/70">{storeName}</div>
              </div>
              <div>
                <label className="label">Unit</label>
                <select
                  className="input"
                  name="unitId"
                  value={unitId}
                  onChange={(event) => setUnitId(event.target.value)}
                >
                  {unitsForProduct.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name} ({unit.conversionToBase} base)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">
                  {mode === 'INCREASE' ? 'Quantity to add' : 'Quantity to remove'}
                </label>
                <input
                  className="input"
                  name="qtyInUnit"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={qtyInput}
                  onChange={(event) => setQtyInput(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                />
                {selectedUnit && qtyNumber > 0 ? (
                  <div className="mt-1 text-xs font-medium text-black/55">
                    {qtyNumber} {selectedUnit.name}
                    <span className="ml-1 text-black/35">= {qtyBase} base units</span>
                  </div>
                ) : null}
              </div>
              {mode === 'INCREASE' ? (
                <>
                  <div>
                    <label className="label">Current quantity (base)</label>
                    <div className="input bg-black/[0.02] tabular-nums">
                      {selectedProduct?.onHandBase ?? 0}
                    </div>
                  </div>
                  <div>
                    <label className="label">Resulting quantity (base)</label>
                    <div className="input bg-emerald-50 tabular-nums text-emerald-900">
                      {qtyNumber > 0 ? resultingQty : selectedProduct?.onHandBase ?? 0}
                    </div>
                  </div>
                  <div>
                    <label className="label">Current average cost</label>
                    <div className="input bg-black/[0.02] tabular-nums">
                      {avgCost > 0 ? formatPence(avgCost, currency) : 'Missing / zero — cannot post'}
                    </div>
                  </div>
                  <div>
                    <label className="label">Inventory-value increase</label>
                    <div className="input bg-emerald-50 tabular-nums text-emerald-900">
                      {valueIncrease > 0 ? formatPence(valueIncrease, currency) : '—'}
                    </div>
                  </div>
                </>
              ) : null}
              <div className="sm:col-span-2 xl:col-span-3">
                <label className="label">Reason code</label>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {(mode === 'INCREASE' ? INCREASE_REASON_OPTIONS : DECREASE_REASON_OPTIONS).map(
                    (option) => (
                      <button
                        key={option.code}
                        type="button"
                        onClick={() => {
                          if (mode === 'INCREASE') {
                            setIncreaseReasonCode(option.code as InventoryIncreaseReasonCode);
                          } else {
                            setDecreaseReasonCode(option.code as InventoryDecreaseReasonCode);
                          }
                          setReason(option.label);
                        }}
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                          (mode === 'INCREASE' ? increaseReasonCode : decreaseReasonCode) ===
                          option.code
                            ? mode === 'INCREASE'
                              ? 'border-emerald-400 bg-emerald-100 text-emerald-700'
                              : 'border-rose-400 bg-rose-100 text-rose-700'
                            : 'border-black/10 bg-white text-black/60 hover:border-black/20'
                        }`}
                      >
                        {option.label}
                      </button>
                    ),
                  )}
                </div>
                <label className="label">Note (required)</label>
                <input
                  className="input"
                  name="reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={
                    mode === 'INCREASE'
                      ? 'Describe where/how the surplus was confirmed'
                      : 'Describe the loss (required)'
                  }
                  required
                  minLength={3}
                />
              </div>
              {isOwner ? (
                <div className="sm:col-span-2 xl:col-span-3">
                  <label className="label">
                    Original adjustment ID (Owner correction only — optional)
                  </label>
                  <input
                    className="input"
                    value={correctsAdjustmentId}
                    onChange={(event) => setCorrectsAdjustmentId(event.target.value)}
                    placeholder="Leave blank for ordinary postings"
                  />
                  <div className="mt-1 text-xs text-black/45">
                    Interim compensating entries must reverse the opposite direction and link the
                    original immutable posting. Never correct an increase with an increase, or a
                    decrease with a decrease.
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {mode === 'INCREASE' ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-sm font-semibold text-ink">Accounting preview</div>
              <div className="mt-2 space-y-1 text-sm text-black/70">
                <div>
                  Debit <span className="font-semibold">1200 — Inventory</span>
                  {valueIncrease > 0 ? ` · ${formatPence(valueIncrease, currency)}` : ''}
                </div>
                <div>
                  Credit <span className="font-semibold">4100 — Inventory Gain &amp; Surplus</span>
                  {valueIncrease > 0 ? ` · ${formatPence(valueIncrease, currency)}` : ''}
                </div>
              </div>
              <div className="mt-3 text-sm text-black/65">
                Average cost stays unchanged. Quantity is increased at the locked average cost.
              </div>
              <label className="mt-4 flex items-start gap-2 text-sm text-emerald-950">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={confirmIncrease}
                  onChange={(event) => setConfirmIncrease(event.target.checked)}
                  required
                />
                <span>
                  I confirm this is a physical-count surplus or genuinely found stock — not a
                  purchase, return, transfer, sale correction, or opening balance. I counted the
                  product first, reviewed quantity and value, and will submit once (do not resubmit
                  if the response is delayed).
                </span>
              </label>
            </div>
          ) : (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <div className="text-sm font-semibold text-ink">Decrease summary</div>
              <div className="mt-1 text-sm text-black/65">
                Stock will be reduced from the on-hand balance at the locked average cost. The journal
                debits Inventory Loss &amp; Shrinkage (5100) and credits Inventory (1200).
              </div>
              {selectedUnit && qtyNumber > 0 ? (
                <div className="mt-3 text-sm">
                  You are about to <span className="font-semibold">remove</span>{' '}
                  <span className="font-semibold">{qtyBase}</span> base units of{' '}
                  <span className="font-semibold">{selectedProduct?.name ?? 'this product'}</span>
                  {' '}(
                  {DECREASE_REASON_OPTIONS.find((o) => o.code === decreaseReasonCode)?.label ??
                    decreaseReasonCode}
                  ).
                </div>
              ) : null}
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-black/60">
              {mode === 'INCREASE'
                ? 'Record the increase once the details, valuation, and confirmation look correct.'
                : 'Record the decrease once the details and reason look correct.'}
            </div>
            <SubmitButton
              className="btn-primary"
              loadingText="Recording…"
            >
              {mode === 'INCREASE' ? 'Record increase' : 'Record decrease'}
            </SubmitButton>
          </div>
        </>
      )}
    </form>
  );
}
