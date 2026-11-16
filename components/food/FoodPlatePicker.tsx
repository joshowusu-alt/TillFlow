'use client';

import { useId, useMemo, useState } from 'react';
import { amountLineVat } from '@/lib/food/amount-vat';
import { formatMoney } from '@/lib/format';
import {
  activeSizes,
  defaultPlateSelection,
  pricePlate,
  type FoodMenu,
  type PlateSelection,
} from '@/lib/food/plate';

function focusAmount(input: HTMLInputElement | null) {
  input?.focus();
}

export default function FoodPlatePicker({
  menu,
  startingPricePence,
  currency = 'GHS',
  allowTillAmount = false,
  amountVatRateBps = 0,
  editAmount,
  sizeAmountEdit,
  onCancel,
  onConfirm,
}: {
  menu: FoodMenu;
  startingPricePence: number;
  currency?: string;
  allowTillAmount?: boolean;
  amountVatRateBps?: number;
  editAmount?: PlateSelection;
  sizeAmountEdit?: { grossPricePence: number; grossExtrasPence: number };
  onCancel: () => void;
  onConfirm: (selection: PlateSelection, platePricePence: number) => void;
}) {
  const vatNoteId = useId();
  const amountIncludesVat = amountVatRateBps > 0;
  const initial = defaultPlateSelection(menu);
  const [sizeId, setSizeId] = useState<string | null>(initial.sizeId ?? null);
  const [qtyByAddon, setQtyByAddon] = useState<Record<string, number>>(() =>
    Object.fromEntries((editAmount?.addons ?? []).map(addon => [addon.addonId, addon.qty])));
  const [otherAmount, setOtherAmount] = useState(Boolean(editAmount));
  const [amount, setAmount] = useState(() => {
    const initialAmount = sizeAmountEdit?.grossPricePence ?? editAmount?.customAmountPence;
    return initialAmount === undefined ? '' : (initialAmount / 100).toFixed(2);
  });
  // The conversion input includes extras. The amount stored for the dish excludes them.
  const grossExtrasPence = sizeAmountEdit?.grossExtrasPence ?? 0;
  const hasPricedExtras = menu.groups.some((group) => group.addons.some(
    (addon) => addon.active !== false && addon.pricePence > 0 && qtyByAddon[addon.id] > 0,
  ));
  const sizes = activeSizes(menu);
  const selection = useMemo<PlateSelection>(
    () => ({
      sizeId: otherAmount ? null : sizeId,
      ...(otherAmount ? { customAmountPence: /^\d+(?:\.\d{1,2})?$/.test(amount.trim()) ? Math.round(Number(amount) * 100) - grossExtrasPence : NaN } : {}),
      addons: Object.entries(qtyByAddon)
        .filter(([, qty]) => qty > 0)
        .map(([addonId, qty]) => ({ addonId, qty })),
    }),
    [qtyByAddon, sizeId, otherAmount, amount, grossExtrasPence],
  );
  const priced = useMemo(() => {
    try {
      return { plate: pricePlate(menu, selection, startingPricePence, allowTillAmount), error: null as string | null };
    } catch (error) {
      return { plate: null, error: error instanceof Error ? error.message : 'Check this plate.' };
    }
  }, [menu, selection, startingPricePence, allowTillAmount]);

  const plate = priced.plate;
  let displayedPrice = plate?.platePricePence ?? 0;
  if (plate?.customAmountPence !== undefined && amountIncludesVat) {
    const { net, vat } = amountLineVat(plate.platePricePence, plate.customAmountPence, 0, amountVatRateBps);
    displayedPrice = net + vat;
  }

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

  const panel = (
      <div role="dialog" aria-modal={editAmount ? undefined : true}
        aria-label={editAmount ? `Edit amount for ${menu.name}` : `Choose a plate for ${menu.name}`}
        className={editAmount ? 'mt-3 rounded-xl border border-black/10 bg-white p-3' : 'max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl'}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">{menu.name}</h2>
            {!editAmount && <p className="text-xs text-black/50">{allowTillAmount && menu.allowCustomAmount ? "Choose a size or type an amount." : "Build one plate. The price is worked out from the menu."}</p>}
          </div>
          <button type="button" className="text-sm text-black/50" onClick={onCancel}>
            Close
          </button>
        </div>

        {!editAmount && menu.inclusions.length > 0 ? (
          <p className="mt-3 text-sm text-black/70">
            Includes {menu.inclusions.map((item) => `${item.qty} ${item.name}`).join(', ')}.
          </p>
        ) : null}

        {!editAmount && sizes.length > 0 ? (
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-black/45">Size</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {sizes.map((size) => (
                <button
                  key={size.id}
                  type="button"
                  onClick={() => { setOtherAmount(false); setSizeId(size.id); }}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                    !otherAmount && sizeId === size.id ? 'bg-accent text-white' : 'bg-black/5 text-black/70'
                  }`}
                >
                  {size.name} · {formatMoney(size.pricePence, currency)}
                  {size.isDefault ? ' · usual' : ''}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {allowTillAmount && menu.allowCustomAmount && !menu.soldOut && (
          <div className="mt-3">
            {!editAmount && <button type="button" aria-pressed={otherAmount} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${otherAmount ? 'bg-accent text-white' : 'bg-black/5 text-black/70'}`} onClick={() => setOtherAmount(!otherAmount)}>Other amount</button>}
            {otherAmount && <div className="mt-3">
              <label className="block">
                Amount (GH₵)
                <input className="input mt-1 text-xl" inputMode="decimal" value={amount}
                  aria-describedby={amountIncludesVat || sizeAmountEdit ? vatNoteId : undefined}
                  ref={focusAmount}
                  onChange={(event) => setAmount(event.target.value)} />
              </label>
              {(amountIncludesVat || sizeAmountEdit) && <span id={vatNoteId} className="mt-1 block text-sm text-black/60">
                {sizeAmountEdit
                  ? `Per plate${hasPricedExtras ? ', including extras' : ''}${amountIncludesVat ? `${hasPricedExtras ? ' and' : ', including'} VAT` : ''}.`
                  : hasPricedExtras ? 'Includes VAT. Extras + VAT.' : 'Includes VAT'}
              </span>}
            </div>}
          </div>
        )}

        {!editAmount && menu.groups.map((group) => (
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

        {priced.error && (!otherAmount || amount) ? <p className="mt-4 text-sm text-rose-700">{priced.error}</p> : null}
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-base font-bold">{priced.plate ? formatMoney(displayedPrice, currency) : '—'}</div>
          <button
            type="button"
            className="btn-primary"
            disabled={!priced.plate}
            onClick={() => priced.plate && onConfirm(selection, priced.plate.platePricePence)}
          >
            {editAmount ? 'Save amount' : otherAmount && priced.plate ? `Add ${formatMoney(displayedPrice, currency)}` : 'Add plate'}
          </button>
        </div>
      </div>
  );
  return editAmount ? panel : (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      {panel}
    </div>
  );
}
