'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { getProductPriceWarnings } from '@/lib/product-price-guards';

type ProductCreateFormEnhancerProps = {
  children: ReactNode;
  currencySymbol: string;
  units: { id: string; name: string }[];
  defaultBaseUnitId?: string;
  createAction: (formData: FormData) => void | Promise<void>;
};

function readDecimal(name: string, form: HTMLFormElement) {
  const el = form.elements.namedItem(name) as HTMLInputElement | null;
  return parseFloat(String(el?.value ?? '').replace(/,/g, '')) || 0;
}

export default function ProductCreateFormEnhancer({
  children,
  currencySymbol,
  units,
  defaultBaseUnitId,
  createAction,
}: ProductCreateFormEnhancerProps) {
  const [blocked, setBlocked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [draft, setDraft] = useState({ sell: 0, cost: 0, qty: 0 });

  const warnings = useMemo(
    () =>
      draft.sell > 0
        ? getProductPriceWarnings({
            sellingPricePence: Math.round(draft.sell * 100),
            defaultCostBasePence: Math.round(draft.cost * 100),
            openingStockQty: Math.round(draft.qty),
          })
        : [],
    [draft]
  );

  const refreshDraft = (form: HTMLFormElement) => {
    setDraft({
      sell: readDecimal('sellingPriceBasePence', form),
      cost: readDecimal('defaultCostBasePence', form),
      qty: readDecimal('openingStockQty', form),
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    refreshDraft(form);
    const sell = readDecimal('sellingPriceBasePence', form);
    const cost = readDecimal('defaultCostBasePence', form);
    const qty = readDecimal('openingStockQty', form);
    const nextWarnings =
      sell > 0
        ? getProductPriceWarnings({
            sellingPricePence: Math.round(sell * 100),
            defaultCostBasePence: Math.round(cost * 100),
            openingStockQty: Math.round(qty),
          })
        : [];

    const confirmField = form.elements.namedItem('confirmPriceWarning') as HTMLInputElement | null;
    if (nextWarnings.length > 0 && confirmField?.value !== '1') {
      event.preventDefault();
      setBlocked(true);
      setConfirmed(false);
      return;
    }
    setBlocked(false);
  };

  return (
    <form
      action={createAction}
      onSubmit={handleSubmit}
      onChange={(e) => {
        refreshDraft(e.currentTarget);
        if (!confirmed) setBlocked(false);
      }}
      className="mt-4 grid gap-4 md:grid-cols-3"
    >
      {children}

      <div className="md:col-span-3 rounded-xl border border-black/10 bg-black/[0.02] p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Opening stock (optional)</h3>
          <p className="text-xs text-black/55 mt-0.5">
            Shelf quantity is saved separately from the price. Add it here so POS can sell this product immediately.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="openingStockQty">
              Opening quantity
            </label>
            <input
              id="openingStockQty"
              className="input"
              name="openingStockQty"
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              placeholder="e.g. 48"
            />
          </div>
          <div>
            <label className="label" htmlFor="openingStockUnitId">
              Stock unit
            </label>
            <select
              id="openingStockUnitId"
              className="input"
              name="openingStockUnitId"
              defaultValue={defaultBaseUnitId ?? units[0]?.id ?? ''}
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="openingStockCostPence">
              Cost per unit ({currencySymbol})
            </label>
            <input
              id="openingStockCostPence"
              className="input"
              name="openingStockCostPence"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="Uses base cost if blank"
            />
          </div>
        </div>
        <p className="text-xs text-black/50">
          Skip for now? You must{' '}
          <a href="/setup/opening-stock" className="font-semibold text-accent underline">
            add opening stock
          </a>{' '}
          before the till can sell this product.
        </p>
      </div>

      {blocked && warnings.length > 0 ? (
        <div className="md:col-span-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-2">
          <p className="font-semibold">Please check this price before saving.</p>
          <ul className="list-disc list-inside text-xs space-y-0.5">
            {warnings.map((w) => (
              <li key={w.code}>{w.message}</li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                const form = (e.target as HTMLInputElement).closest('form');
                const field = form?.elements.namedItem('confirmPriceWarning') as HTMLInputElement | null;
                if (field) field.value = e.target.checked ? '1' : '';
                if (e.target.checked) form?.requestSubmit();
              }}
            />
            I have checked the price — save anyway
          </label>
        </div>
      ) : null}

      <input type="hidden" name="confirmPriceWarning" defaultValue="" />
    </form>
  );
}
