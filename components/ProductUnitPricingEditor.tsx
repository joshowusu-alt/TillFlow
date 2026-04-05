'use client';

import { useEffect, useMemo, useState } from 'react';

type UnitOption = {
  id: string;
  name: string;
  pluralName?: string;
};

export type EditableProductUnitConfig = {
  unitId: string;
  conversionToBase: number;
  isBaseUnit: boolean;
  sellingPricePence?: number | null;
  defaultCostPence?: number | null;
};

type ProductUnitPricingEditorProps = {
  units: UnitOption[];
  basePricePence?: number;
  baseCostPence?: number;
  currencySymbol: string;
  fieldName?: string;
  initialConfigs?: EditableProductUnitConfig[];
  onConfigsChange?: (configs: EditableProductUnitConfig[]) => void;
};

type EditorRow = {
  key: string;
  unitId: string;
  conversionToBase: string;
  sellingPrice: string;
  defaultCost: string;
  isBaseUnit: boolean;
};

function formatPenceForInput(value?: number | null) {
  if (value === null || value === undefined) {
    return '';
  }

  return (value / 100).toFixed(2);
}

function parseCurrencyToPence(value: string) {
  const trimmed = value.replace(/,/g, '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : Math.round(parsed * 100);
}

function buildInitialRows(units: UnitOption[], initialConfigs?: EditableProductUnitConfig[]): EditorRow[] {
  if (initialConfigs?.length) {
    return [...initialConfigs]
      .sort((a, b) => Number(b.isBaseUnit) - Number(a.isBaseUnit))
      .map((config, index) => ({
        key: `${config.unitId || 'unit'}-${index}`,
        unitId: config.unitId,
        conversionToBase: String(config.conversionToBase || 1),
        sellingPrice: formatPenceForInput(config.sellingPricePence),
        defaultCost: formatPenceForInput(config.defaultCostPence),
        isBaseUnit: config.isBaseUnit,
      }));
  }

  return [
    {
      key: 'base-unit',
      unitId: units[0]?.id ?? '',
      conversionToBase: '1',
      sellingPrice: '',
      defaultCost: '',
      isBaseUnit: true,
    },
  ];
}

export default function ProductUnitPricingEditor({
  units,
  basePricePence = 0,
  baseCostPence = 0,
  currencySymbol,
  fieldName = 'unitConfigsJson',
  initialConfigs,
  onConfigsChange,
}: ProductUnitPricingEditorProps) {
  const [rows, setRows] = useState<EditorRow[]>(() => buildInitialRows(units, initialConfigs));

  const parsedConfigs = useMemo<EditableProductUnitConfig[]>(() => {
    return rows
      .filter((row) => row.isBaseUnit || row.unitId.trim())
      .map((row) => ({
        unitId: row.unitId.trim(),
        conversionToBase: row.isBaseUnit ? 1 : Math.max(1, parseInt(row.conversionToBase, 10) || 1),
        isBaseUnit: row.isBaseUnit,
        sellingPricePence: row.isBaseUnit ? null : parseCurrencyToPence(row.sellingPrice),
        defaultCostPence: row.isBaseUnit ? null : parseCurrencyToPence(row.defaultCost),
      }));
  }, [rows]);

  useEffect(() => {
    onConfigsChange?.(parsedConfigs);
  }, [onConfigsChange, parsedConfigs]);

  const hiddenValue = useMemo(() => JSON.stringify(parsedConfigs), [parsedConfigs]);

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        key: `unit-${Date.now()}-${prev.length}`,
        unitId: '',
        conversionToBase: '2',
        sellingPrice: '',
        defaultCost: '',
        isBaseUnit: false,
      },
    ]);
  };

  const updateRow = (key: string, patch: Partial<EditorRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((row) => row.key !== key || row.isBaseUnit));
  };

  return (
    <div className="space-y-4 rounded-2xl border border-black/5 bg-black/[0.02] p-4 sm:p-5">
      <input type="hidden" name={fieldName} value={hiddenValue} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-black/40">Selling units</div>
          <div className="mt-1 text-sm text-black/60">
            Keep inventory in the physical base unit, then add exact sellable units like quarter-pack, half-pack, pack, or carton.
          </div>
        </div>
        <button type="button" className="btn-secondary w-full text-xs sm:w-auto" onClick={addRow}>
          Add selling unit
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const conversionToBase = row.isBaseUnit ? 1 : Math.max(1, parseInt(row.conversionToBase, 10) || 1);
          const fallbackSellingPrice = basePricePence * conversionToBase;
          const fallbackDefaultCost = baseCostPence * conversionToBase;
          const selectedIds = new Set(rows.filter((candidate) => candidate.key !== row.key).map((candidate) => candidate.unitId));

          return (
            <div key={row.key} className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_160px_repeat(2,minmax(0,1fr))_auto] lg:items-start">
                <div className="min-w-0">
                  <label className="label">{row.isBaseUnit ? 'Base unit' : 'Sellable unit'}</label>
                  <select
                    className="input"
                    value={row.unitId}
                    onChange={(event) => updateRow(row.key, { unitId: event.target.value })}
                  >
                    {!row.isBaseUnit ? <option value="">Select unit…</option> : null}
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id} disabled={!row.isBaseUnit && selectedIds.has(unit.id)}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs text-black/50">
                    {row.isBaseUnit
                      ? 'Inventory is always stored in this physical base unit.'
                      : 'Cashiers will sell this unit directly — no decimal quantity entry needed.'}
                  </div>
                </div>

                <div className="min-w-0">
                  <label className="label">Base units inside</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    disabled={row.isBaseUnit}
                    value={row.isBaseUnit ? '1' : row.conversionToBase}
                    onChange={(event) => updateRow(row.key, { conversionToBase: event.target.value })}
                  />
                  <div className="mt-1 text-xs text-black/50">
                    {row.isBaseUnit ? 'Base unit is always 1.' : `1 configured unit = ${conversionToBase} base units`}
                  </div>
                </div>

                <div className="min-w-0">
                  <label className="label">Selling price override</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    disabled={row.isBaseUnit}
                    placeholder="Use fallback"
                    value={row.sellingPrice}
                    onChange={(event) => updateRow(row.key, { sellingPrice: event.target.value })}
                  />
                  <div className="mt-1 text-xs text-black/50">
                    {row.isBaseUnit
                      ? 'Uses the base price above.'
                      : basePricePence > 0
                        ? `Fallback: ${currencySymbol}${(fallbackSellingPrice / 100).toFixed(2)}`
                        : 'Falls back to the base price above when left blank.'}
                  </div>
                </div>

                <div className="min-w-0">
                  <label className="label">Default cost override</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    disabled={row.isBaseUnit}
                    placeholder="Use fallback"
                    value={row.defaultCost}
                    onChange={(event) => updateRow(row.key, { defaultCost: event.target.value })}
                  />
                  <div className="mt-1 text-xs text-black/50">
                    {row.isBaseUnit
                      ? 'Uses the base cost above.'
                      : baseCostPence > 0
                        ? `Fallback: ${currencySymbol}${(fallbackDefaultCost / 100).toFixed(2)}`
                        : 'Falls back to the base cost above when left blank.'}
                  </div>
                </div>

                <div className="flex items-end lg:justify-end">
                  {!row.isBaseUnit ? (
                    <button type="button" className="btn-ghost w-full text-xs lg:w-auto" onClick={() => removeRow(row.key)}>
                      Remove
                    </button>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      Inventory base
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
