'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveDishAction } from '@/app/actions/food';
import { emptyDishDraft, type DishDraft } from '@/lib/food/dish-draft';

export default function DishForm({ initial, productId }: { initial?: DishDraft; productId?: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<DishDraft>(initial ?? emptyDishDraft());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const counted = draft.stockMode === 'COUNTED';

  function update<K extends keyof DishDraft>(key: K, value: DishDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await saveDishAction({ ...draft, productId: productId ?? draft.productId ?? null });
    setPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.push(`/products/dishes/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="card space-y-3 p-4">
        <h2 className="text-base font-semibold">The dish</h2>
        <label className="block text-sm">
          Name
          <input className="input mt-1" value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="Banku" required />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Starting price (GH₵)
            <input className="input mt-1" inputMode="decimal" value={draft.startingPriceCedis} onChange={(event) => update('startingPriceCedis', event.target.value)} placeholder="25" required />
          </label>
          <label className="block text-sm">
            Estimated cost (GH₵, optional)
            <input className="input mt-1" inputMode="decimal" value={draft.estimatedCostCedis} onChange={(event) => update('estimatedCostCedis', event.target.value)} placeholder="10" />
          </label>
        </div>
        <p className="text-xs text-black/50">An estimate is enough. Sizes below replace this price when a customer or cashier picks one.</p>
        <label className="block text-sm">
          Description for the online menu
          <textarea className="input mt-1" rows={2} value={draft.description} onChange={(event) => update('description', event.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.showOnline} onChange={(event) => update('showOnline', event.target.checked)} />
          Show on the online menu
        </label>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-base font-semibold">Portions</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`rounded-full px-3 py-1.5 text-sm font-semibold ${!counted ? 'bg-accent text-white' : 'bg-black/5'}`} onClick={() => update('stockMode', 'NOT_COUNTED')}>
            Not counted
          </button>
          <button type="button" className={`rounded-full px-3 py-1.5 text-sm font-semibold ${counted ? 'bg-accent text-white' : 'bg-black/5'}`} onClick={() => update('stockMode', 'COUNTED')}>
            Count portions
          </button>
        </div>
        {!counted ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.soldOut} onChange={(event) => update('soldOut', event.target.checked)} />
            Sold out
          </label>
        ) : (
          <>
            <label className="block text-sm">
              Show Low when portions left are at or below
              <input className="input mt-1 w-28" inputMode="numeric" value={draft.lowAt || ''} onChange={(event) => update('lowAt', Math.max(0, Math.floor(Number(event.target.value) || 0)))} />
            </label>
            <label className="block text-sm">
              Cost per cooked portion (GH₵, optional)
              <input className="input mt-1 w-36" inputMode="decimal" value={draft.costPerPortionCedis ?? ''} onChange={(event) => update('costPerPortionCedis', event.target.value)} placeholder="0" />
            </label>
            <p className="text-xs text-black/50">Used only when leftovers are thrown away. Leave it blank and the count changes with no money posted.</p>
          </>
        )}
        <p className="text-xs text-black/50">
          {counted
            ? 'The till warns when portions are low or gone. It does not hold them before payment. Online orders still reserve portions when the customer checks out.'
            : 'This dish is simply available or sold out. Nothing is counted.'}
        </p>
      </section>

      <section className="card space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Sizes</h2>
          <button type="button" className="text-sm font-semibold text-accent" onClick={() => update('sizes', [...draft.sizes, { name: '', priceCedis: '', isDefault: draft.sizes.length === 0 }])}>
            Add size
          </button>
        </div>
        {draft.sizes.length === 0 ? <p className="text-sm text-black/50">Leave this empty for one price.</p> : null}
        {draft.sizes.map((size, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_8rem_auto_auto]">
            <input className="input" placeholder="Medium" value={size.name} onChange={(event) => update('sizes', draft.sizes.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} />
            <input className="input" inputMode="decimal" placeholder="GH₵" value={size.priceCedis} onChange={(event) => update('sizes', draft.sizes.map((row, rowIndex) => rowIndex === index ? { ...row, priceCedis: event.target.value } : row))} />
            <label className="flex items-center gap-1 text-xs">
              <input type="radio" name="default-size" checked={size.isDefault} onChange={() => update('sizes', draft.sizes.map((row, rowIndex) => ({ ...row, isDefault: rowIndex === index })))} />
              Usual
            </label>
            <button type="button" className="text-xs text-rose-700" onClick={() => update('sizes', draft.sizes.filter((_, rowIndex) => rowIndex !== index))}>Remove</button>
          </div>
        ))}
      </section>

      <section className="card space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Included</h2>
          <button type="button" className="text-sm font-semibold text-accent" onClick={() => update('inclusions', [...draft.inclusions, { name: '', qty: 1, counts: true }])}>
            Add item
          </button>
        </div>
        {draft.inclusions.map((item, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_5rem_auto]">
            <input className="input" placeholder="bowl of banku" value={item.name} onChange={(event) => update('inclusions', draft.inclusions.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} />
            <input className="input" inputMode="numeric" value={item.qty} onChange={(event) => update('inclusions', draft.inclusions.map((row, rowIndex) => rowIndex === index ? { ...row, qty: Math.max(1, Math.floor(Number(event.target.value) || 1)) } : row))} />
            {counted ? (
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={item.counts} onChange={(event) => update('inclusions', draft.inclusions.map((row, rowIndex) => rowIndex === index ? { ...row, counts: event.target.checked } : row))} />
                Counts
              </label>
            ) : <span />}
          </div>
        ))}
      </section>

      <section className="card space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Extras</h2>
          <button
            type="button"
            className="text-sm font-semibold text-accent"
            onClick={() => update('groups', [...draft.groups, { name: '', selection: 'MANY', required: false, addons: [{ name: '', priceCedis: '', maxQty: 1, stockPortions: 0 }] }])}
          >
            Add group
          </button>
        </div>
        {draft.groups.map((group, groupIndex) => (
          <div key={groupIndex} className="space-y-2 rounded-xl border border-black/10 p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input className="input" placeholder="Protein or extras" value={group.name} onChange={(event) => update('groups', draft.groups.map((row, index) => index === groupIndex ? { ...row, name: event.target.value } : row))} />
              <button type="button" className="text-xs text-rose-700" onClick={() => update('groups', draft.groups.filter((_, index) => index !== groupIndex))}>Remove group</button>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={group.selection === 'SINGLE'}
                onChange={(event) => update('groups', draft.groups.map((row, index) => index === groupIndex ? { ...row, selection: event.target.checked ? 'SINGLE' : 'MANY', required: event.target.checked ? row.required : false } : row))}
              />
              Choose one
            </label>
            {group.selection === 'SINGLE' ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={group.required} onChange={(event) => update('groups', draft.groups.map((row, index) => index === groupIndex ? { ...row, required: event.target.checked } : row))} />
                Required
              </label>
            ) : null}
            {group.addons.map((addon, addonIndex) => (
              <div key={addonIndex} className="grid gap-2 sm:grid-cols-[1fr_6rem_4rem_5rem_auto]">
                <input className="input" placeholder="extra banku" value={addon.name} onChange={(event) => update('groups', draft.groups.map((row, index) => index === groupIndex ? { ...row, addons: row.addons.map((item, itemIndex) => itemIndex === addonIndex ? { ...item, name: event.target.value } : item) } : row))} />
                <input className="input" inputMode="decimal" placeholder="GH₵" value={addon.priceCedis} onChange={(event) => update('groups', draft.groups.map((row, index) => index === groupIndex ? { ...row, addons: row.addons.map((item, itemIndex) => itemIndex === addonIndex ? { ...item, priceCedis: event.target.value } : item) } : row))} />
                <input className="input" inputMode="numeric" title="Maximum" value={addon.maxQty} disabled={group.selection === 'SINGLE'} onChange={(event) => update('groups', draft.groups.map((row, index) => index === groupIndex ? { ...row, addons: row.addons.map((item, itemIndex) => itemIndex === addonIndex ? { ...item, maxQty: Math.max(1, Math.floor(Number(event.target.value) || 1)) } : item) } : row))} />
                {counted ? (
                  <input className="input" inputMode="numeric" title="Portions used" value={addon.stockPortions} onChange={(event) => update('groups', draft.groups.map((row, index) => index === groupIndex ? { ...row, addons: row.addons.map((item, itemIndex) => itemIndex === addonIndex ? { ...item, stockPortions: Math.max(0, Math.floor(Number(event.target.value) || 0)) } : item) } : row))} />
                ) : <span />}
                <button type="button" className="text-xs text-rose-700" onClick={() => update('groups', draft.groups.map((row, index) => index === groupIndex ? { ...row, addons: row.addons.filter((_, itemIndex) => itemIndex !== addonIndex) } : row))}>Remove</button>
              </div>
            ))}
            <button type="button" className="text-xs font-semibold text-accent" onClick={() => update('groups', draft.groups.map((row, index) => index === groupIndex ? { ...row, addons: [...row.addons, { name: '', priceCedis: '', maxQty: 1, stockPortions: 0 }] } : row))}>
              Add choice
            </button>
          </div>
        ))}
      </section>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Saving…' : productId ? 'Save dish' : 'Add dish'}</button>
    </form>
  );
}
