'use client';

import { useMemo, useState } from 'react';
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

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId),
    [products, productId]
  );
  const unitsForProduct = selectedProduct?.units ?? [];
  const selectedUnit = unitsForProduct.find((unit) => unit.id === unitId);

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
    <form action={createStockAdjustmentAction} className="grid gap-4 md:grid-cols-3">
      <input type="hidden" name="storeId" value={storeId} />
      <div>
        <label className="label">Product</label>
        <select
          className="input"
          name="productId"
          value={productId}
          onChange={(event) => {
            const next = event.target.value;
            setProductId(next);
            const product = products.find((item) => item.id === next);
            const base = product?.units.find((unit) => unit.isBaseUnit) ?? product?.units[0];
            setUnitId(base?.id ?? '');
          }}
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
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
      <div className="md:col-span-2">
        <label className="label">Reason</label>
        <input
          className="input"
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Optional reason"
        />
      </div>
      <div className="md:col-span-3">
        <button className="btn-primary">Record adjustment</button>
      </div>
    </form>
  );
}
