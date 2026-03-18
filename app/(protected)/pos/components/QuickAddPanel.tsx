'use client';

import { memo, useState, useCallback } from 'react';
import { quickCreateProductAction } from '@/app/actions/products';
import BarcodeScanInput from '@/components/BarcodeScanInput';
import ProductUnitPricingEditor, { type EditableProductUnitConfig } from '@/components/ProductUnitPricingEditor';

type UnitDto = {
  id: string;
  name: string;
  pluralName: string;
  conversionToBase: number;
  isBaseUnit: boolean;
};

type CreatedProduct = {
  id: string;
  name: string;
  barcode: string | null;
  sellingPriceBasePence: number;
  vatRateBps: number;
  promoBuyQty: number;
  promoGetQty: number;
  onHandBase: number;
  units: UnitDto[];
};

type QuickAddPanelProps = {
  units: { id: string; name: string }[];
  currencySymbol?: string;
  initialBarcode?: string;
  pendingScan?: string | null;
  onCreated: (product: CreatedProduct, matchedScan: boolean) => void;
  onCancel: () => void;
};

function buildDefaultUnitConfigs(units: { id: string; name: string }[]): EditableProductUnitConfig[] {
  return units[0]
    ? [
        {
          unitId: units[0].id,
          conversionToBase: 1,
          isBaseUnit: true,
        },
      ]
    : [];
}

function parseCurrencyToPence(value: string): number {
  const trimmed = value.replace(/,/g, '').trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

function QuickAddPanelInner({ units, currencySymbol = '₵', initialBarcode, pendingScan, onCreated, onCancel }: QuickAddPanelProps) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState(initialBarcode ?? '');
  const [unitConfigs, setUnitConfigs] = useState<EditableProductUnitConfig[]>(() => buildDefaultUnitConfigs(units));
  const [sellPrice, setSellPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [vatRate, setVatRate] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    setError(null);
    if (!name.trim()) {
      setError('Please enter a product name.');
      return;
    }
    const baseUnit = unitConfigs.find((config) => config.isBaseUnit);
    const firstNonBase = unitConfigs.find((config) => !config.isBaseUnit);
    if (!baseUnit?.unitId) {
      setError('Please configure a base unit.');
      return;
    }
    const selling = parseCurrencyToPence(sellPrice);
    const cost = parseCurrencyToPence(costPrice);
    if (selling <= 0 || cost <= 0) {
      setError('Please enter both the selling price and cost.');
      return;
    }
    setIsCreating(true);
    try {
      const result = await quickCreateProductAction({
        name: name.trim(),
        sku: sku.trim() || null,
        barcode: barcode.trim() || null,
        sellingPriceBasePence: selling,
        defaultCostBasePence: cost,
        vatRateBps: Math.max(0, parseInt(vatRate, 10) || 0),
        baseUnitId: baseUnit.unitId,
        packagingUnitId: firstNonBase?.unitId ?? null,
        packagingConversion: firstNonBase?.conversionToBase ?? 0,
        unitConfigs,
      });
      if (!result || !result.success) throw new Error(result?.error ?? 'Unable to create product.');
      const created = result.data;
      const scanBarcode = pendingScan ?? barcode.trim();
      const matchedScan = !!(scanBarcode && created.barcode === scanBarcode);
      onCreated(created, matchedScan);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create product.';
      setError(message);
    } finally {
      setIsCreating(false);
    }
  }, [name, sku, barcode, unitConfigs, sellPrice, costPrice, vatRate, pendingScan, onCreated]);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">New Product</div>
        <button type="button" className="text-xs text-black/40 hover:text-black/60" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">SKU</label>
          <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div>
          <label className="label">Barcode</label>
          <BarcodeScanInput name="barcode" value={barcode} onChange={(val) => setBarcode(val)} />
        </div>
        <div>
          <label className="label">Sell Price</label>
          <input className="input" type="number" min={0} step="0.01" inputMode="decimal" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
        </div>
        <div>
          <label className="label">Cost Price</label>
          <input className="input" type="number" min={0} step="0.01" inputMode="decimal" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
        </div>
        <div>
          <label className="label">VAT (bps)</label>
          <input className="input" type="number" min={0} value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
        </div>
        <div className="md:col-span-3">
          <ProductUnitPricingEditor
            units={units}
            currencySymbol={currencySymbol}
            basePricePence={parseCurrencyToPence(sellPrice)}
            baseCostPence={parseCurrencyToPence(costPrice)}
            fieldName="quickAddUnitConfigsJson"
            initialConfigs={unitConfigs}
            onConfigsChange={setUnitConfigs}
          />
        </div>
        {error && <div className="md:col-span-3 text-sm text-rose">{error}</div>}
        <div className="md:col-span-3">
          <button type="button" className="btn-primary" onClick={handleCreate} disabled={isCreating}>
            {isCreating ? 'Creating…' : pendingScan ? 'Create & Add to Cart' : 'Create Product'}
          </button>
        </div>
      </div>
    </div>
  );
}

const QuickAddPanel = memo(QuickAddPanelInner);
export default QuickAddPanel;
