'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SubmitButton from '@/components/SubmitButton';
import { createStockAdjustmentAction } from '@/app/actions/inventory';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import type { InventoryDecreaseReasonCode } from '@/lib/services/inventory-decrease';

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
};

const REASON_OPTIONS: { code: InventoryDecreaseReasonCode; label: string }[] = [
  { code: 'WASTAGE', label: 'Wastage' },
  { code: 'EXPIRED', label: 'Expired' },
  { code: 'DAMAGED', label: 'Damaged' },
  { code: 'THEFT', label: 'Theft' },
  { code: 'STOCKTAKE_SHORTFALL', label: 'Stocktake shortfall' },
  { code: 'AUTHORISED_QUANTITY_CORRECTION', label: 'Authorised quantity correction' },
];

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `adj-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function StockAdjustmentClient({
  storeId,
  products,
  phase1Enabled,
}: {
  storeId: string;
  products: ProductDto[];
  phase1Enabled: boolean;
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [unitId, setUnitId] = useState(products[0]?.units[0]?.id ?? '');
  const [qtyInput, setQtyInput] = useState('1');
  const [reasonCode, setReasonCode] = useState<InventoryDecreaseReasonCode>('WASTAGE');
  const [reason, setReason] = useState('Wastage');
  const [productSearch, setProductSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIdempotencyKey(newIdempotencyKey());
  }, [productId, unitId, qtyInput, reasonCode, reason]);

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
    [products, productId]
  );
  const unitsForProduct = selectedProduct?.units ?? [];
  const selectedUnit = unitsForProduct.find((unit) => unit.id === unitId);
  const qtyNumber = Math.max(0, Math.floor(Number(qtyInput) || 0));

  const onHandLabel = useMemo(() => {
    if (!selectedProduct) return '';
    const baseUnit = selectedProduct.units.find((unit) => unit.isBaseUnit);
    const packaging = getPrimaryPackagingUnit(
      selectedProduct.units.map((unit) => ({ conversionToBase: unit.conversionToBase, unit }))
    );
    return formatMixedUnit({
      qtyBase: selectedProduct.onHandBase,
      baseUnit: baseUnit?.name ?? 'unit',
      baseUnitPlural: baseUnit?.pluralName,
      packagingUnit: packaging?.unit.name,
      packagingUnitPlural: packaging?.unit.pluralName,
      packagingConversion: packaging?.conversionToBase
    });
  }, [selectedProduct]);

  if (!phase1Enabled) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-900">
        <div className="font-semibold">Inventory decreases are not enabled</div>
        <p className="mt-1 text-amber-800/80">
          Phase 1 quantity decreases are gated behind the rollout flag. Adjustments are unavailable
          until that flag is enabled — legacy unhardened adjustments cannot be used as a bypass.
        </p>
      </div>
    );
  }

  return (
    <form action={createStockAdjustmentAction} className="space-y-5">
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="direction" value="DECREASE" />
      <input type="hidden" name="reasonCode" value={reasonCode} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-4 sm:p-5">
        <div className="mb-4">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40">Decrease details</div>
          <div className="mt-1 text-sm text-black/60">
            Record wastage, damage, theft, expiry, stocktake shortfall, or an authorised quantity
            correction. Quantity increases are not available in Phase 1.
          </div>
        </div>

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
            {onHandLabel ? <div className="mt-1 text-xs text-black/50">On hand: {onHandLabel}</div> : null}
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
            {selectedUnit ? (
              <div className="mt-1 text-xs text-black/50">
                1 {selectedUnit.name} = {selectedUnit.conversionToBase} base units
              </div>
            ) : null}
          </div>
          <div>
            <label className="label">Quantity to remove</label>
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
                <span className="ml-1 text-black/35">= {qtyNumber * selectedUnit.conversionToBase} base units</span>
              </div>
            ) : null}
          </div>
          <div className="sm:col-span-2 xl:col-span-3">
            <label className="label">Reason code</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {REASON_OPTIONS.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => {
                    setReasonCode(option.code);
                    setReason(option.label);
                  }}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                    reasonCode === option.code
                      ? 'border-rose-400 bg-rose-100 text-rose-700'
                      : 'border-black/10 bg-white text-black/60 hover:border-rose-300 hover:text-rose-600'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <input
              className="input"
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Describe the loss (required)"
              required
              minLength={3}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <div className="text-sm font-semibold text-ink">Decrease summary</div>
        <div className="mt-1 text-sm text-black/65">
          Stock will be reduced from the on-hand balance at the locked average cost. The journal
          debits Inventory Loss &amp; Shrinkage (5100) and credits Inventory (1200).
        </div>
        {selectedUnit && qtyNumber > 0 ? (
          <div className="mt-3 text-sm">
            You are about to <span className="font-semibold">remove</span>{' '}
            <span className="font-semibold">{qtyNumber * selectedUnit.conversionToBase}</span> base units of{' '}
            <span className="font-semibold">{selectedProduct?.name ?? 'this product'}</span>
            {' '}({REASON_OPTIONS.find((o) => o.code === reasonCode)?.label ?? reasonCode}).
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-black/60">Record the decrease once the details and reason look correct.</div>
        <SubmitButton className="btn-primary" loadingText="Recording…">Record decrease</SubmitButton>
      </div>
    </form>
  );
}
