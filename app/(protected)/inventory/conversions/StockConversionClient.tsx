'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createStockConversionAction, searchStockConversionProducts } from '@/app/actions/stock-conversion';
import { conversionQuantity, planStockConversion, type ConversionProduct } from '@/lib/stock-conversion';
import SubmitButton from '@/components/SubmitButton';
import { formatMoney } from '@/lib/format';

type Selection = { product: ConversionProduct | null; unit: string; quantity: string };
const empty = (): Selection => ({ product: null, unit: '', quantity: '' });

function FormLock({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return <fieldset disabled={pending} className="min-w-0 space-y-4">{children}</fieldset>;
}

function ProductPicker({ title, storeId, selection, onChange }: { title: string; storeId: string; selection: Selection; onChange: (selection: Selection) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ConversionProduct[]>([]);
  const [status, setStatus] = useState('Type at least two letters to search.');
  useEffect(() => {
    let current = true;
    if (query.trim().length < 2) { setResults([]); setStatus('Type at least two letters to search.'); return; }
    setStatus('Searching…');
    const timer = setTimeout(() => {
      void searchStockConversionProducts(query, storeId).then(result => {
        if (!current) return;
        if (result.success) { setResults(result.data); setStatus(result.data.length ? 'Select a product below.' : 'No matching products.'); }
        else { setResults([]); setStatus(result.error); }
      }).catch(() => { if (current) { setResults([]); setStatus('Search unavailable. Try again.'); } });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [query, storeId]);
  const prefix = title === 'Use stock' ? 'source' : 'destination';
  const selectedUnit = selection.product?.units.find(u => u.id === selection.unit);
  const currentStock = selection.product?.stock?.qtyOnHandBase ?? 0;
  const unitSize = selectedUnit?.conversionToBase || 1;
  const baseUnitName = selection.product?.units.find(u => u.conversionToBase === 1)?.name ?? 'base units';
  const stockLabel = currentStock >= 0 && unitSize > 1
    ? `${Math.floor(currentStock / unitSize).toLocaleString()} ${selectedUnit?.name}${currentStock % unitSize ? ` + ${currentStock % unitSize} ${baseUnitName}` : ''}`
    : `${currentStock.toLocaleString()} ${baseUnitName}`;
  const isSource = prefix === 'source';
  return <fieldset className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <legend className="sr-only">{title}</legend>
    <div className="mb-5 flex items-start gap-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${isSource ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>{isSource ? '1' : '2'}</span>
      <div className="min-w-0"><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-0.5 text-xs leading-5 text-slate-500">{isSource ? 'The bag, carton or item you are opening.' : 'What you counted after opening or repacking.'}</p></div>
    </div>
    <label className="mb-1.5 block text-xs font-semibold text-slate-600" htmlFor={`${prefix}-search`}>Search product name or barcode</label>
    <input id={`${prefix}-search`} className="input min-h-11 w-full" placeholder={isSource ? 'Find the bag or carton…' : 'Find the cups or pieces…'} value={query} onChange={e => { setQuery(e.target.value); setResults([]); onChange(empty()); }} autoComplete="off" />
    {!selection.product ? <div className="mt-3">
      <p className="text-xs leading-5 text-slate-500" role="status">{status}</p>
      <ul className="mt-2 max-h-60 space-y-2 overflow-y-auto">{results.map(product => <li key={product.id}><button type="button" aria-label={product.name} className="min-h-12 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" onClick={() => { onChange({ product, unit: product.units.find(u => u.conversionToBase === 1)?.id ?? product.units[0]?.id ?? '', quantity: '' }); setResults([]); }}>{product.name}</button></li>)}</ul>
      {!query.trim() ? <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs leading-5 text-slate-400">{isSource ? 'Choose the stock you will use.' : 'Choose the product you will produce.'}</div> : null}
    </div> : <div className="mt-4 space-y-4">
      <div className={`rounded-xl border p-3 ${isSource ? 'border-blue-100 bg-blue-50/60' : 'border-emerald-100 bg-emerald-50/60'}`}>
        <div className="flex items-start justify-between gap-2"><p className="min-w-0 break-words text-sm font-semibold leading-6 text-slate-900">{selection.product.name}</p><button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" onClick={() => { setQuery(''); setResults([]); onChange(empty()); document.getElementById(`${prefix}-search`)?.focus(); }}>Change</button></div>
        <p className="mt-1 text-xs text-slate-600">Current stock: <strong>{stockLabel}</strong></p>
      </div>
      <input type="hidden" name={`${prefix}ProductId`} value={selection.product.id} />
      <div className="grid min-w-0 grid-cols-2 gap-3">
        <label className="min-w-0 text-xs font-semibold text-slate-600">Unit<select className="input mt-1.5 min-h-12 w-full min-w-0 text-sm font-medium" name={`${prefix}UnitId`} value={selection.unit} onChange={e => onChange({ ...selection, unit: e.target.value })}>{selection.product.units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <label className="min-w-0 text-xs font-semibold text-slate-600">{isSource ? 'Quantity used' : 'Quantity counted'}<input className="input mt-1.5 min-h-12 w-full min-w-0 text-lg font-semibold tabular-nums" type="number" inputMode="numeric" min="1" step="1" placeholder="0" required name={`${prefix}Qty`} value={selection.quantity} onChange={e => onChange({ ...selection, quantity: e.target.value })} /></label>
      </div>
      <p className="text-xs leading-5 text-slate-500">{isSource ? 'Enter how many you are taking from stock.' : 'Enter the actual quantity counted, even if the yield varies.'}</p>
    </div>}
  </fieldset>;
}

export default function StockConversionClient({ storeId, currency, savedReceipt }: { storeId: string; currency: string; savedReceipt: { id: string; costPence: number } | null }) {
  const router = useRouter();
  const [source, setSource] = useState<Selection>(empty);
  const [destination, setDestination] = useState<Selection>(empty);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<{ id: string; costPence: number } | null>(savedReceipt);
  useEffect(() => { setKey(crypto.randomUUID()); }, []);
  function edited() { setReceipt(null); setConfirmed(false); setError(''); setKey(crypto.randomUUID()); }
  let preview: ReturnType<typeof planStockConversion> | null = null;
  let explanation = 'Select the stock used and enter the actual quantity produced.';
  if (source.product && destination.product && source.quantity && destination.quantity) {
    try {
      if (source.product.id === destination.product.id) throw new Error('Choose different products. Packs and pieces of one product already share stock through its selling units.');
      const from = source.product.units.find(u => u.id === source.unit);
      const to = destination.product.units.find(u => u.id === destination.unit);
      preview = planStockConversion(source.product.stock, destination.product.stock,
        conversionQuantity(Number(source.quantity), from?.conversionToBase ?? 0), conversionQuantity(Number(destination.quantity), to?.conversionToBase ?? 0));
    } catch (e) { explanation = e instanceof Error ? e.message : explanation; }
  }
  return <div className="space-y-4">
    {receipt ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 sm:p-5" role="status"><p className="font-semibold">Conversion saved.</p><p className="mt-1 leading-6">{formatMoney(receipt.costPence, currency)} transferred between products. Both stock histories have been updated.</p><details className="mt-2 text-xs text-emerald-800"><summary className="w-fit cursor-pointer py-1 font-medium">View conversion reference</summary><p className="mt-1 break-all font-mono">{receipt.id}</p></details></div> : null}
    <form className="space-y-4" action={async form => {
      setError('');
      try {
        const result = await createStockConversionAction(form);
        if (!result.success) { setError(result.error); return; }
        setReceipt(result.data); setSource(empty()); setDestination(empty()); setNote(''); setConfirmed(false); setKey(crypto.randomUUID()); router.replace(`/inventory/conversions?conversion=${encodeURIComponent(result.data.id)}`);
      } catch { setError('Could not confirm the result. Keep this form and retry; the same conversion will not be posted twice.'); }
    }}>
      <FormLock>
      <input type="hidden" name="storeId" value={storeId} /><input type="hidden" name="idempotencyKey" value={key} />
      <input type="hidden" name="expectedCostPence" value={preview?.costPence ?? ''} />
      <input type="hidden" name="expectedSourceQtyBase" value={preview ? (source.product?.stock?.qtyOnHandBase ?? 0) - preview.sourceAfter.qtyOnHandBase : ''} />
      <input type="hidden" name="expectedDestinationQtyBase" value={preview ? preview.destinationAfter.qtyOnHandBase - (destination.product?.stock?.qtyOnHandBase ?? 0) : ''} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <ProductPicker title="Use stock" storeId={storeId} selection={source} onChange={v => { setSource(v); edited(); }} />
            <ProductPicker title="Produce stock" storeId={storeId} selection={destination} onChange={v => { setDestination(v); edited(); }} />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <label className="block text-sm font-semibold text-slate-800" htmlFor="conversion-note">Add a note <span className="font-normal text-slate-400">· required</span></label>
            <p className="mt-1 text-xs leading-5 text-slate-500">A short explanation helps your team trace this conversion later.</p>
            <textarea id="conversion-note" name="note" rows={2} className="input mt-3 w-full text-sm" maxLength={500} required value={note} placeholder="For example: opened one sugar bag and counted 95 cups" onChange={e => { setNote(e.target.value); edited(); }} />
          </div>
          <p className="px-1 text-xs leading-5 text-slate-500">Buying new stock? Record it in Purchases first. Use this page when changing stock you already own into a different product.</p>
        </div>
        <section aria-labelledby="conversion-review-title" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-24">
          <div className="border-b border-slate-100 px-4 py-4 sm:px-5"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">3</span><h2 id="conversion-review-title" className="text-sm font-semibold text-slate-900">Review conversion</h2></div></div>
          <div className="space-y-4 p-4 sm:p-5">
            <div aria-live="polite">{preview ? <>
              <div className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Using</p><p className="mt-1 break-words font-medium text-slate-700">{source.product?.name}</p></div><p className="shrink-0 text-right font-semibold tabular-nums text-slate-900">{source.quantity}<span className="mt-0.5 block max-w-24 whitespace-normal text-xs font-normal text-slate-500">{source.product?.units.find(u => u.id === source.unit)?.name}</span></p></div>
                <div className="border-t border-dashed border-slate-200" />
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Producing</p><p className="mt-1 break-words font-medium text-slate-700">{destination.product?.name}</p></div><p className="shrink-0 text-right font-semibold tabular-nums text-emerald-700">{destination.quantity}<span className="mt-0.5 block max-w-24 whitespace-normal text-xs font-normal text-slate-500">{destination.product?.units.find(u => u.id === destination.unit)?.name}</span></p></div>
              </div>
              <div className="mt-5 rounded-xl bg-blue-50 p-4"><p className="text-xs font-medium text-blue-700">Stock value transferred</p><p className="mt-1 break-words text-2xl font-bold tracking-tight tabular-nums text-blue-950">{formatMoney(preview.costPence, currency)}</p><p className="mt-2 text-xs leading-5 text-blue-800">No income or expense is created. The counted output shares the source stock’s cost.</p></div>
              {preview.sourceCostMethod === 'stored-weighted-average' ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">Cost uses the recorded average for the source stock. Check it before confirming.</p> : null}
              {preview.destinationValueIncomplete ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">Older destination stock has incomplete valuation. This conversion does not resolve those older costs.</p> : null}
            </> : <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm leading-6 text-slate-600">{explanation}</p><p className="mt-2 text-xs leading-5 text-slate-400">Your transferred cost will appear here before you save.</p></div>}</div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-xs leading-5 text-slate-600"><input className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600" type="checkbox" name="confirmed" value="yes" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required />I checked the source stock, actual output and transferred cost.</label>
            {error ? <p className="rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-800" role="alert">{error}</p> : null}
            <SubmitButton disabled={!key || !preview || !confirmed || !note.trim()} loadingText="Saving both stock entries…">Save conversion</SubmitButton>
            <p className="text-center text-[11px] leading-5 text-slate-400">Both stock entries are saved together.</p>
          </div>
        </section>
      </div>
      </FormLock>
    </form>
  </div>;
}
