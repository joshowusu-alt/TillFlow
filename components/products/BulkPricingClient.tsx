'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { previewBulkPricingAction, applyBulkPricingAction } from '@/app/actions/bulk-pricing';
import { formatMoney, getCurrencySymbol } from '@/lib/format';
import { BULK_PRICING_LIMIT, type BulkPricingInput, type BulkPricingPreview } from '@/lib/products/bulk-pricing';

type Props = { currency: string; categories: { id: string; name: string }[];
  divisions: { id: string; name: string; categoryId: string; groups: { id: string; name: string }[] }[] };
const initial: BulkPricingInput = { categoryId: '', divisionId: '', groupId: '', search: '', basis: 'SELLING_PRICE',
  operation: 'INCREASE', method: 'PERCENT', value: '10', decimals: 2, units: 'BASE_ONLY' };

export default function BulkPricingClient({ currency, categories, divisions }: Props) {
  const [input, setInput] = useState(initial);
  const [preview, setPreview] = useState<BulkPricingPreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [acknowledge, setAcknowledge] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  // Coordinate event-driven server actions with the router's revalidation render.
  const [, startTransition] = useTransition();
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (preview) {
      reviewHeading.current?.focus({ preventScroll: true });
      reviewHeading.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [preview]);
  const visibleDivisions = divisions.filter(d => !input.categoryId || d.categoryId === input.categoryId);
  const visibleGroups = visibleDivisions.filter(d => !input.divisionId || d.id === input.divisionId).flatMap(d => d.groups.map(g => ({ ...g, division: d.name })));
  const selectedRows = preview?.rows.filter(r => selected.includes(r.id)) ?? [];
  const hasWarnings = selectedRows.some(r => r.warnings.length > 0);
  const eligible = preview?.rows.filter(r => !r.error && r.changed) ?? [];
  const money = (p: number) => formatMoney(p, currency);

  function change(patch: Partial<BulkPricingInput>) {
    setInput(old => ({ ...old, ...patch })); setPreview(null); setSelected([]); setAcknowledge(false); setConfirmed(false); setError(''); setSuccess('');
  }
  async function loadPreview(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setPending(true);
    setError(''); setSuccess(''); setPreview(null); setConfirmed(false); setAcknowledge(false);
      try {
        const result = await previewBulkPricingAction(input);
        if (!result.success) { setError(result.error); return; }
        setPreview(result.data); setSelected(result.data.rows.filter(r => !r.error && r.changed).map(r => r.id));
      } catch { setError('Could not load the preview. Check your connection and try again.'); }
      finally { busy.current = false; setPending(false); }
  }
  async function apply() {
    if (!preview || !confirmed || busy.current) return;
    busy.current = true; setPending(true);
    setError('');
      try {
        const result = await applyBulkPricingAction({ input: preview.input, fingerprint: preview.fingerprint, selectedIds: selected, acknowledgeWarnings: acknowledge, reason });
        setConfirmed(false);
        if (!result.success) { setError(result.error); setPreview(null); return; }
        setSuccess(`Updated ${result.data.updated} ${result.data.updated === 1 ? 'product' : 'products'}. The price changes and your reason have been recorded.`);
        setPreview(null); setSelected([]); setReason(''); setAcknowledge(false);
      } catch {
        // A lost response may follow a committed write. Never offer to replay the old percentage batch.
        setPreview(null); setConfirmed(false); setError('Could not confirm the result. Check the product prices before making another update.');
      } finally { busy.current = false; setPending(false); }
  }
  return <div className="space-y-5" data-bulk-pricing aria-busy={pending}>
    {error && <p role="alert" data-bulk-pricing-error className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
    <details open={!preview} className="card p-4 sm:p-5">
      <summary className="cursor-pointer text-sm font-semibold">1. Choose products and adjustment
        <span className="mt-1 block text-xs font-normal text-muted">{input.basis === 'CATALOGUE_COST' ? 'Catalogue cost' : 'Current selling price'} {input.operation === 'INCREASE' ? '+' : '−'} {input.method === 'PERCENT' ? `${input.value}%` : `${getCurrencySymbol(currency)}${input.value}`} · {input.units === 'BASE_ONLY' ? 'Base price only' : 'All selling units'} · {input.decimals} decimal places</span>
      </summary>
    <form onSubmit={event => startTransition(() => { void loadPreview(event); })} className="mt-4 space-y-4" aria-label="Bulk pricing settings">
      <fieldset disabled={pending} className="space-y-4">
        <legend className="sr-only">Price settings</legend>
        <p className="text-sm text-muted">Active products only. Preview up to {BULK_PRICING_LIMIT} products per batch; narrow the filters for larger catalogues.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm font-medium">Category<select className="input mt-1" value={input.categoryId} onChange={e => change({ categoryId: e.target.value, divisionId: '', groupId: '' })}><option value="">All categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="block text-sm font-medium">Division<select className="input mt-1" value={input.divisionId} onChange={e => change({ divisionId: e.target.value, groupId: '' })}><option value="">All divisions</option>{visibleDivisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label className="block text-sm font-medium">Group<select className="input mt-1" value={input.groupId} onChange={e => change({ groupId: e.target.value })}><option value="">All groups</option>{visibleGroups.map(g => <option key={g.id} value={g.id}>{g.name} · {g.division}</option>)}</select></label>
          <label className="block text-sm font-medium">Search<input className="input mt-1" value={input.search} onChange={e => change({ search: e.target.value })} placeholder="Name, edition or exact barcode" maxLength={150} /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm font-medium">Starting value<select className="input mt-1" value={input.basis} onChange={e => change({ basis: e.target.value as BulkPricingInput['basis'] })}><option value="SELLING_PRICE">Current selling price</option><option value="CATALOGUE_COST">Catalogue cost</option></select></label>
          <label className="block text-sm font-medium">Adjustment<select className="input mt-1" value={input.operation} onChange={e => change({ operation: e.target.value as BulkPricingInput['operation'] })}><option value="INCREASE">Increase / add</option><option value="DECREASE">Decrease / subtract</option></select></label>
          <label className="block text-sm font-medium">Adjustment type<select className="input mt-1" value={input.method} onChange={e => change({ method: e.target.value as BulkPricingInput['method'] })}><option value="PERCENT">Percentage (%)</option><option value="AMOUNT">Fixed amount ({getCurrencySymbol(currency)})</option></select></label>
          <label className="block text-sm font-medium">{input.method === 'PERCENT' ? 'Percentage (%)' : `Amount (${getCurrencySymbol(currency)})`}<input className="input mt-1" type="number" inputMode="decimal" min="0.01" step="0.01" value={input.value} onChange={e => change({ value: e.target.value })} required /></label>
          <label className="block text-sm font-medium">Round to<select className="input mt-1" value={input.decimals} onChange={e => change({ decimals: Number(e.target.value) as 0 | 1 | 2 })}><option value={2}>2 decimal places</option><option value={1}>1 decimal place</option><option value={0}>Whole currency units</option></select></label>
          <label className="block text-sm font-medium">Selling units<select className="input mt-1" value={input.units} onChange={e => change({ units: e.target.value as BulkPricingInput['units'] })}><option value="BASE_ONLY">Base price only</option><option value="ALL_UNITS">All selling units</option></select></label>
        </div>
        <p className="text-sm text-muted">{input.basis === 'CATALOGUE_COST' ? 'Cost plus a percentage is markup, not profit margin. This uses catalogue cost, not branch average stock cost. Products without the required cost cannot be selected.' : 'The adjustment starts from each current selling price.'}</p>
        <p className="text-sm text-muted">{input.units === 'BASE_ONLY' ? 'Separately set pack prices stay the same. Packs that inherit the base price follow the new base price; review all resulting prices below.' : 'Each selling unit is calculated and rounded separately. A pack may receive its own price when its rounded result differs from the base price multiplied by the pack quantity.'} Half values round up.</p>
        <button className="btn-primary" type="submit">{pending ? 'Working…' : 'Preview prices'}</button>
      </fieldset>
    </form>
    </details>
    {preview && <section className="card space-y-4 p-4 sm:p-5" aria-labelledby="bulk-review-title">
      <h2 id="bulk-review-title" ref={reviewHeading} tabIndex={-1} className="scroll-mt-24 font-semibold">2. Review prices</h2>
      <p className="text-sm text-muted">{preview.rows.length} matched · {eligible.length} can change · {selected.length} selected. Expand a product to check its selling units and warnings.</p>
      {preview.rows.length === 0 && <p>No active products match these filters.</p>}
      {eligible.length > 0 && <button type="button" className="btn-secondary text-sm" disabled={pending} onClick={() => { setSelected(selected.length === eligible.length ? [] : eligible.map(r => r.id)); setConfirmed(false); setAcknowledge(false); }}>{selected.length === eligible.length ? 'Deselect all' : 'Select all eligible'}</button>}
      <div className="space-y-3">
        {preview.rows.map(row => <article key={row.id} className="min-w-0 rounded-xl border border-black/10 p-3">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={selected.includes(row.id)} disabled={pending || !!row.error || !row.changed} onChange={e => { setSelected(ids => e.target.checked ? [...ids, row.id] : ids.filter(id => id !== row.id)); setAcknowledge(false); setConfirmed(false); }} />
            <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{row.name}</span>
              {!row.error && <span className="mt-1 flex flex-wrap gap-x-2 text-sm tabular-nums"><span>Base: {money(row.baseBefore)}</span><span aria-hidden="true">→</span><span className="font-semibold">{money(row.baseAfter)}</span></span>}
              <span className="mt-1 block text-xs text-muted">Catalogue base cost: {row.baseCost > 0 ? money(row.baseCost) : 'Not recorded'}</span>
              {row.error ? <span className="mt-1 block text-sm text-red-800">Cannot update: {row.error}</span> : !row.changed ? <span className="block text-sm text-muted">No price change after rounding.</span> : null}
              {row.warnings.length > 0 && <span className="mt-1 block text-sm font-medium text-amber-800">{row.warnings.length} {row.warnings.length === 1 ? 'warning' : 'warnings'} — review before applying</span>}
            </span>
          </label>
          {!row.error && <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium text-accent">Selling-unit prices and warnings</summary>
            <div className="mt-2 space-y-2">{row.prices.map(p => <div key={p.id} className="rounded-lg bg-slate-50 p-2"><p className="break-words font-medium">{p.label}</p><p className="flex flex-wrap gap-x-2 tabular-nums"><span>{money(p.before)}</span><span>→</span><strong>{money(p.after)}</strong></p><p className="text-xs text-muted">Catalogue unit cost: {p.cost > 0 ? money(p.cost) : 'Not recorded'}</p><p className="text-xs text-muted">{p.afterOverride === null ? 'Inherits base price' : 'Separately set price'}{p.changed ? ' · Changes in this batch' : ' · Unchanged'}</p></div>)}
              {row.warnings.map((warning, i) => <p key={i} className="rounded-lg bg-amber-50 p-2 text-amber-900">{warning}</p>)}
            </div>
          </details>}
        </article>)}
      </div>
      {eligible.length > 0 && <div className="space-y-3 border-t border-black/10 pt-4">
        <label className="block text-sm font-medium">Reason for change<textarea className="input mt-1" rows={2} maxLength={300} value={reason} disabled={pending} onChange={e => { setReason(e.target.value); setConfirmed(false); }} placeholder="For example, supplier price increase" /></label>
        {hasWarnings && <label className="flex items-start gap-2 text-sm"><input className="mt-1 shrink-0" type="checkbox" checked={acknowledge} disabled={pending} onChange={e => { setAcknowledge(e.target.checked); setConfirmed(false); }} /><span>I have reviewed the warnings for the selected products and accept these prices.</span></label>}
        {confirmed ? <div className="space-y-3 rounded-xl border border-accent/20 bg-accentSoft/40 p-3"><p className="text-sm">Apply these prices to <strong>{selected.length} products across all branches</strong>? Refresh printed price labels after updating.</p><div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={pending} onClick={() => startTransition(() => { void apply(); })}>{pending ? 'Applying…' : 'Confirm price update'}</button><button type="button" className="btn-secondary" disabled={pending} onClick={() => setConfirmed(false)}>Keep reviewing</button></div></div>
          : <button type="button" className="btn-primary" disabled={pending || !selected.length || !reason.trim() || (hasWarnings && !acknowledge)} onClick={() => setConfirmed(true)}>Review update for {selected.length} {selected.length === 1 ? 'product' : 'products'}</button>}
      </div>}
    </section>}
  </div>;
}
