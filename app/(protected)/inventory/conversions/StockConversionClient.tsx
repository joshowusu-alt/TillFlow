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
  return <fieldset className="card space-y-3 p-4">
    <legend className="px-1 font-semibold">{title}</legend>
    <label className="block text-sm" htmlFor={`${prefix}-search`}>Search product name or barcode</label>
    <input id={`${prefix}-search`} className="input w-full" value={query} onChange={e => { setQuery(e.target.value); setResults([]); onChange(empty()); }} autoComplete="off" />
    {!selection.product ? <>
      <p className="text-sm text-black/60" role="status">{status}</p>
      <ul className="max-h-52 space-y-1 overflow-y-auto">{results.map(product => <li key={product.id}><button type="button" className="min-h-11 w-full rounded-lg border p-2 text-left text-sm" onClick={() => { onChange({ product, unit: product.units.find(u => u.conversionToBase === 1)?.id ?? product.units[0]?.id ?? '', quantity: '' }); setResults([]); }}>{product.name}</button></li>)}</ul>
    </> : <>
      <p className="font-semibold">{selection.product.name}</p>
      <input type="hidden" name={`${prefix}ProductId`} value={selection.product.id} />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Unit<select className="input mt-1 w-full" name={`${prefix}UnitId`} value={selection.unit} onChange={e => onChange({ ...selection, unit: e.target.value })}>{selection.product.units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <label className="text-sm">{prefix === 'source' ? 'Quantity used' : 'Quantity counted'}<input className="input mt-1 w-full" type="number" inputMode="numeric" min="1" step="1" required name={`${prefix}Qty`} value={selection.quantity} onChange={e => onChange({ ...selection, quantity: e.target.value })} /></label>
      </div>
      <p className="text-xs text-black/60">Recorded stock: {selection.product.stock?.qtyOnHandBase ?? 0} base units.</p>
    </>}
  </fieldset>;
}

export default function StockConversionClient({ storeId, currency }: { storeId: string; currency: string }) {
  const router = useRouter();
  const [source, setSource] = useState<Selection>(empty);
  const [destination, setDestination] = useState<Selection>(empty);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<{ id: string; costPence: number } | null>(null);
  useEffect(() => { setKey(crypto.randomUUID()); }, []);
  function edited() { setConfirmed(false); setError(''); setKey(crypto.randomUUID()); }
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
    {receipt ? <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950" role="status">Conversion saved. Stock value transferred: {formatMoney(receipt.costPence, currency)}. Reference: <span className="break-all">{receipt.id}</span>. Both products’ stock histories show this reference.</div> : null}
    <form className="space-y-4" action={async form => {
      setError('');
      try {
        const result = await createStockConversionAction(form);
        if (!result.success) { setError(result.error); return; }
        setReceipt(result.data); setSource(empty()); setDestination(empty()); setNote(''); setConfirmed(false); setKey(crypto.randomUUID()); router.refresh();
      } catch { setError('Could not confirm the result. Keep this form and retry; the same conversion will not be posted twice.'); }
    }}>
      <FormLock>
      <input type="hidden" name="storeId" value={storeId} /><input type="hidden" name="idempotencyKey" value={key} />
      <input type="hidden" name="expectedCostPence" value={preview?.costPence ?? ''} />
      <input type="hidden" name="expectedSourceQtyBase" value={preview ? (source.product?.stock?.qtyOnHandBase ?? 0) - preview.sourceAfter.qtyOnHandBase : ''} />
      <input type="hidden" name="expectedDestinationQtyBase" value={preview ? preview.destinationAfter.qtyOnHandBase - (destination.product?.stock?.qtyOnHandBase ?? 0) : ''} />
      <div className="grid gap-4 md:grid-cols-2">
        <ProductPicker key={`source-${receipt?.id ?? ''}`} title="Use stock" storeId={storeId} selection={source} onChange={v => { setSource(v); edited(); }} />
        <ProductPicker key={`destination-${receipt?.id ?? ''}`} title="Produce stock" storeId={storeId} selection={destination} onChange={v => { setDestination(v); edited(); }} />
      </div>
      <label className="block text-sm">Conversion note<textarea name="note" className="input mt-1 w-full" maxLength={500} required value={note} placeholder="For example: opened a sugar bag and counted the cups produced" onChange={e => { setNote(e.target.value); edited(); }} /></label>
      <div className="rounded-xl border bg-slate-50 p-4 text-sm" aria-live="polite">{preview ? <>
        <p className="font-semibold">{source.quantity} {source.product?.units.find(u => u.id === source.unit)?.name} of {source.product?.name} → {destination.quantity} {destination.product?.units.find(u => u.id === destination.unit)?.name} of {destination.product?.name}</p>
        <p className="mt-2">Stock value transferred: <strong>{formatMoney(preview.costPence, currency)}</strong>.</p>
        <p>No income or expense is created. The counted output shares the source stock’s cost.</p>
        {preview.sourceCostMethod === 'stored-weighted-average' ? <p className="mt-2">Cost uses the recorded average for the source stock. Check it before confirming.</p> : null}
        {preview.destinationValueIncomplete ? <p className="mt-2">Older destination stock has incomplete valuation. This conversion does not resolve those older costs.</p> : null}
      </> : explanation}</div>
      <label className="flex items-start gap-3 text-sm"><input className="mt-1 h-5 w-5" type="checkbox" name="confirmed" value="yes" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required />I checked the source stock, actual output and transferred cost.</label>
      {error ? <p className="text-sm text-rose-700" role="alert">{error}</p> : null}
      <SubmitButton disabled={!key || !preview || !confirmed || !note.trim()} loadingText="Saving both stock entries…">Save conversion</SubmitButton>
      </FormLock>
    </form>
  </div>;
}
