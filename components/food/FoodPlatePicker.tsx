'use client';

import { useMemo, useState } from 'react';
import { formatMoney } from '@/lib/format';
import {
  activeSizes,
  defaultPlateSelection,
  pricePlate,
  type FoodMenu,
  type PlateSelection,
} from '@/lib/food/plate';

export default function FoodPlatePicker({
  menu,
  startingPricePence,
  currency = 'GHS',
  onCancel,
  onConfirm,
}: {
  menu: FoodMenu;
  startingPricePence: number;
  currency?: string;
  onCancel: () => void;
  onConfirm: (selection: PlateSelection, platePricePence: number) => void;
}) {
  const initial = defaultPlateSelection(menu);
  const [sizeId, setSizeId] = useState<string | null>(initial.sizeId ?? null);
  const [qtyByAddon, setQtyByAddon] = useState<Record<string, number>>({});
  const sizes = activeSizes(menu);
  const selection = useMemo<PlateSelection>(
    () => ({
      sizeId,
      addons: Object.entries(qtyByAddon)
        .filter(([, qty]) => qty > 0)
        .map(([addonId, qty]) => ({ addonId, qty })),
    }),
    [qtyByAddon, sizeId],
  );
  const priced = useMemo(() => {
    try {
      return { plate: pricePlate(menu, selection, startingPricePence), error: null as string | null };
    } catch (error) {
      return { plate: null, error: error instanceof Error ? error.message : 'Check this plate.' };
    }
  }, [menu, selection, startingPricePence]);

  function setAddonQty(addonId: string, qty: number, groupSelection: 'MANY' | 'SINGLE') {
    setQtyByAddon((prev) => {
      const next = { ...prev };
      if (groupSelection === 'SINGLE') {
        const group = menu.groups.find((candidate) => candidate.addons.some((addon) => addon.id === addonId));
        for (const addon of group?.addons ?? []) delete next[addon.id];
      }
      if (qty <= 0) delete next[addonId];
      else next[addonId] = qty;
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">{menu.name}</h2>
            <p className="text-xs text-black/50">Build one plate. The price is worked out from the menu.</p>
          </div>
          <button type="button" className="text-sm text-black/50" onClick={onCancel}>
            Close
          </button>
        </div>

        {menu.inclusions.length > 0 ? (
          <p className="mt-3 text-sm text-black/70">
            Includes {menu.inclusions.map((item) => `${item.qty} ${item.name}`).join(', ')}.
          </p>
        ) : null}

        {sizes.length > 0 ? (
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-black/45">Size</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {sizes.map((size) => (
                <button
                  key={size.id}
                  type="button"
                  onClick={() => setSizeId(size.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                    sizeId === size.id ? 'bg-accent text-white' : 'bg-black/5 text-black/70'
                  }`}
                >
                  {size.name} · {formatMoney(size.pricePence, currency)}
                  {size.isDefault ? ' · usual' : ''}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {menu.groups.map((group) => (
          <div key={group.id} className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-black/45">
              {group.name}
              {group.required ? ' · choose one' : group.selection === 'SINGLE' ? ' · one only' : ''}
            </div>
            <div className="mt-2 space-y-2">
              {group.addons.filter((addon) => addon.active !== false).map((addon) => {
                const qty = qtyByAddon[addon.id] ?? 0;
                const max = group.selection === 'SINGLE' ? 1 : addon.maxQty;
                return (
                  <div key={addon.id} className="flex items-center justify-between gap-3 rounded-xl border border-black/10 px-3 py-2">
                    <div>
                      <div className="text-sm font-medium">{addon.name}</div>
                      <div className="text-xs text-black/50">
                        {addon.pricePence > 0 ? `+ ${formatMoney(addon.pricePence, currency)}` : 'No extra charge'}
                        {addon.stockPortions > 0 ? ` · uses ${addon.stockPortions} portion${addon.stockPortions === 1 ? '' : 's'}` : ''}
                      </div>
                    </div>
                    {group.selection === 'SINGLE' ? (
                      <button
                        type="button"
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${qty > 0 ? 'bg-accent text-white' : 'bg-black/5'}`}
                        onClick={() => setAddonQty(addon.id, qty > 0 ? 0 : 1, 'SINGLE')}
                      >
                        {qty > 0 ? 'Chosen' : 'Choose'}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button type="button" className="h-8 w-8 rounded-lg border" onClick={() => setAddonQty(addon.id, qty - 1, 'MANY')} disabled={qty <= 0}>−</button>
                        <span className="w-4 text-center text-sm">{qty}</span>
                        <button type="button" className="h-8 w-8 rounded-lg border" onClick={() => setAddonQty(addon.id, Math.min(max, qty + 1), 'MANY')} disabled={qty >= max}>+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {priced.error ? <p className="mt-4 text-sm text-rose-700">{priced.error}</p> : null}
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-base font-bold">{priced.plate ? formatMoney(priced.plate.platePricePence, currency) : '—'}</div>
          <button
            type="button"
            className="btn-primary"
            disabled={!priced.plate}
            onClick={() => priced.plate && onConfirm(selection, priced.plate.platePricePence)}
          >
            Add plate
          </button>
        </div>
      </div>
    </div>
  );
}
