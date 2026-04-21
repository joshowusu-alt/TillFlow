'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import SubmitButton from '@/components/SubmitButton';
import { createStockAdjustmentAction } from '@/app/actions/inventory';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';

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

export default function StockAdjustmentClient({
  storeId,
  products
}: {
  storeId: string;
  products: ProductDto[];
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [unitId, setUnitId] = useState(products[0]?.units[0]?.id ?? '');
  const [qtyInput, setQtyInput] = useState('1');
  const [direction, setDirection] = useState<'INCREASE' | 'DECREASE'>('DECREASE');
  const [reason, setReason] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
  const directionTone = direction === 'DECREASE' ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50';
  const directionText = direction === 'DECREASE' ? 'Stock will be reduced from on-hand balance.' : 'Stock will be added back to on-hand balance.';

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

  return (
    <form action={createStockAdjustmentAction} className="space-y-5">
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="productId" value={productId} />
      <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-4 sm:p-5">
        <div className="mb-4">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40">Adjustment details</div>
          <div className="mt-1 text-sm text-black/60">Choose the product, unit, and quantity to record stock found or stock lost.</div>
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
                // Delay so click on dropdown item registers before close
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
            <label className="label">Quantity</label>
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
          <div>
            <label className="label">Direction</label>
            <select
              className="input"
              name="direction"
              value={direction}
              onChange={(event) => setDirection(event.target.value as 'INCREASE' | 'DECREASE')}
            >
              <option value="DECREASE">Decrease (shrinkage)</option>
              <option value="INCREASE">Increase (found stock)</option>
            </select>
          </div>
          <div className="sm:col-span-2 xl:col-span-2">
            <label className="label">Reason</label>
            {direction === 'DECREASE' && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {['Wastage', 'Expired', 'Damaged', 'Theft', 'Stocktake correction'].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setReason(label)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                      reason === label
                        ? 'border-rose-400 bg-rose-100 text-rose-700'
                        : 'border-black/10 bg-white text-black/60 hover:border-rose-300 hover:text-rose-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <input
              className="input"
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={direction === 'DECREASE' ? 'Reason (or select above)' : 'Optional reason'}
            />
          </div>
        </div>
      </div>

      <div className={`rounded-2xl border p-4 ${directionTone}`}>
        <div className="text-sm font-semibold text-ink">Adjustment summary</div>
        <div className="mt-1 text-sm text-black/65">{directionText}</div>
        {selectedUnit && qtyNumber > 0 ? (
          <div className="mt-3 text-sm">
            You are about to <span className="font-semibold">{direction === 'DECREASE' ? 'remove' : 'add'}</span>{' '}
            <span className="font-semibold">{qtyNumber * selectedUnit.conversionToBase}</span> base units of{' '}
            <span className="font-semibold">{selectedProduct?.name ?? 'this product'}</span>.
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-black/60">Record the adjustment once the details and reason look correct.</div>
        <SubmitButton className="btn-primary" loadingText="Recording…">Record adjustment</SubmitButton>
      </div>
    </form>
  );
}
