'use client';

import { useState } from 'react';

type Mode = 'returns' | 'short' | 'consignment';
const money = (value: number) => `GH₵${(value / 100).toFixed(2)}`;
const units = (raw: string, max: number) => Math.min(max, Math.max(0, Math.floor(Number(raw) || 0)));

export default function SupplierStockPreview() {
  const [mode, setMode] = useState<Mode>('returns');
  const [quantity, setQuantity] = useState(4);
  const [returned, setReturned] = useState(0);
  const [paid, setPaid] = useState(false);
  const [first, setFirst] = useState(4);
  const [second, setSecond] = useState(3);
  const [later, setLater] = useState(false);
  const [sold, setSold] = useState(6);
  const [settled, setSettled] = useState(0);
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const record = (message: string) => { setNotice(message); setHistory(previous => [message, ...previous]); };
  const changeMode = (next: Mode) => { setMode(next); setNotice(''); setHistory([]); };
  const reset = () => { setQuantity(4); setReturned(0); setPaid(false); setFirst(4); setSecond(3); setLater(false); setSold(6); setSettled(0); setNotice(''); setHistory([]); };
  const available = 10 - returned;
  const returnValue = Math.min(quantity, available) * 1000;
  const shortValue = ((5 - first) + (4 - second)) * 1000;
  const payable = Math.max(0, sold - settled) * 1000;
  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-8 text-slate-900">
    <header className="space-y-3"><p className="text-sm font-bold text-blue-700">TillFlow · Supplier stock</p><h1 className="text-3xl font-bold">Return only what you need to</h1><p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><strong>Interactive design preview — fictional data only.</strong> Buttons simulate outcomes in this browser. Nothing is saved to TillFlow, and no customer stock, supplier balances or payments are changed. Backend implementation is not complete.</p></header>
    <nav aria-label="Preview scenarios" className="flex flex-wrap gap-2">{([['returns', 'Partial purchase return'], ['short', 'Short delivery'], ['consignment', 'Consignment settlement']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={mode === key} className={mode === key ? 'btn-primary' : 'btn-ghost'} onClick={() => changeMode(key)}>{label}</button>)}</nav>
    <section className="card space-y-5 p-5 sm:p-7">
      {mode === 'returns' ? <>
        <div><h2 className="text-xl font-bold">Return part of a purchase</h2><p className="mt-2 text-sm text-slate-600">Demo supplier · Invoice DEMO-001 · 10 books originally received at GH₵10 each.</p></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={paid} onChange={event => setPaid(event.target.checked)} /> This example invoice was already paid in full</label>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Product</th><th className="p-2">Previously returned</th><th className="p-2">Available</th><th className="p-2">Return now</th></tr></thead><tbody><tr><td className="p-2">Demo book</td><td className="p-2">{returned}</td><td className="p-2">{available}</td><td className="p-2"><input aria-label="Books to return" className="input max-w-28" type="number" min={0} max={available} step={1} value={Math.min(quantity, available)} onChange={event => setQuantity(units(event.target.value, available))} /></td></tr></tbody></table></div>
        <div className="rounded-xl bg-blue-50 p-4"><p className="text-2xl font-bold">Return value: {money(returnValue)}</p><p className="mt-2">Stock after this return: {available - Math.min(quantity, available)} books.</p><p className="mt-2 text-sm">{paid ? `Supplier credit / refund receivable: ${money(returnValue)}. No cash receipt is assumed.` : `Reduce outstanding supplier debt by ${money(returnValue)}. Remaining invoice balance: ${money((available - Math.min(quantity, available)) * 1000)}.`}</p></div>
        <button type="button" disabled={quantity <= 0 || available === 0} className="btn-primary" onClick={() => { const qty = Math.min(quantity, available); if (qty <= 0) return; setReturned(previous => previous + qty); setQuantity(0); record(`Simulated return: ${qty} books, ${money(qty * 1000)}. Original invoice retained; only selected quantities removed.`); }}>Simulate selected return</button>
        <p className="text-xs text-slate-500">This example assumes no tax, discounts, delivery charges, sales or other stock movements. Real returns must also validate current branch stock.</p>
      </> : mode === 'short' ? <>
        <div><h2 className="text-xl font-bold">Record what actually arrived</h2><p className="mt-2 text-sm text-slate-600">Demo supplier · Invoice lists 5 units of Product A and 4 of Product B. Both cost GH₵10 per unit.</p></div>
        <div className="grid gap-4 sm:grid-cols-2"><label className="label">Product A — received out of 5<input className="input mt-2" type="number" min={0} max={5} value={first} onChange={event => setFirst(units(event.target.value, 5))} /></label><label className="label">Product B — received out of 4<input className="input mt-2" type="number" min={0} max={4} value={second} onChange={event => setSecond(units(event.target.value, 4))} /></label></div>
        <label className="label">What happens to the missing goods?<select className="input mt-2" value={later ? 'later' : 'credit'} onChange={event => setLater(event.target.value === 'later')}><option value="credit">Supplier confirms cancellation and credit</option><option value="later">Supplier will deliver the balance later</option></select></label>
        <div className="rounded-xl bg-blue-50 p-4"><p className="font-bold">Stock correction: −{5 - first} A · −{4 - second} B</p><p className="mt-2">{later ? `Awaiting delivery: ${9 - first - second} units. Do not automatically reduce the supplier charge.` : `Confirmed credit: ${money(shortValue)}. Remaining unpaid invoice: ${money(9000 - shortValue)}.`}</p><p className="mt-2 text-sm">These goods never arrived: record a receipt correction, rather than describing them as a physical return.</p></div>
        <button className="btn-primary" type="button" onClick={() => setNotice('Preview only: record the actual quantities, the delivery discrepancy and the supplier’s confirmed resolution. No live correction has been posted.')}>Review correction outcome</button>
      </> : <>
        <div><h2 className="text-xl font-bold">Pay for consigned books sold</h2><p className="mt-2 text-sm text-slate-600">Demo supplier · Lot CONSIGN-001 · 10 supplier-owned books · Agreed settlement price GH₵10 each.</p></div>
        <label className="label">Books sold from this lot<input className="input mt-2 max-w-xs" type="number" min={settled} max={10} value={sold} onChange={event => setSold(Math.max(settled, units(event.target.value, 10)))} /></label>
        <div className="grid gap-3 sm:grid-cols-3">{[['Received', 10], ['Sold', sold], ['Unsold to return', 10 - sold]].map(([label, value]) => <div key={label} className="rounded-xl border p-4"><p className="text-sm">{label}</p><p className="text-2xl font-bold">{value}</p></div>)}</div>
        <div className="rounded-xl bg-blue-50 p-4"><p className="text-2xl font-bold">Awaiting settlement: {money(payable)}</p><p className="mt-2">Already settled: {settled} books · Unsold return value at agreed price: {money((10 - sold) * 1000)}.</p><p className="mt-2 text-sm">Unsold returns do not create a cash refund. Only sold, unsettled quantities enter this settlement.</p></div>
        <button className="btn-primary" type="button" disabled={sold <= settled} onClick={() => { if (sold <= settled) return; record(`Simulated settlement: ${sold - settled} books for ${money(payable)}. These quantities cannot be settled twice.`); setSettled(sold); }}>Simulate settlement</button>
      </>}
      {notice ? <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">{notice}</p> : null}
    </section>
    {history.length ? <section className="card space-y-2 p-5"><h2 className="font-bold">Simulation history</h2>{history.map((item, index) => <p key={index} className="border-t pt-2 text-sm">{item}</p>)}</section> : null}
    <button className="btn-ghost" type="button" onClick={reset}>Reset fictional examples</button>
  </main>;
}
