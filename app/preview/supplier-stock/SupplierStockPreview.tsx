'use client';
import { useState } from 'react';

const cash = (value: number) => `GH₵${(value / 100).toFixed(2)}`;
const valid = (raw: string, max: number) => /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) && Number(raw) <= max;
function Field({ label, value, set, max }: { label: string; value: string; set: (v: string) => void; max: number }) {
  return <label className="block text-sm font-semibold">{label}<input className="input mt-2 text-lg" type="text" inputMode="numeric" pattern="[0-9]*" value={value} onChange={e => set(e.target.value)} aria-invalid={!valid(value, max)} /><span className="mt-1 block text-xs font-normal text-slate-500">Enter whole units, 0–{Math.max(0, max)}</span></label>;
}
function Summary({ rows }: { rows: [string, string | number][] }) {
  return <dl className="rounded-xl bg-blue-50 px-4">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-blue-100 py-3 last:border-0"><dt className="text-sm">{label}</dt><dd className="shrink-0 text-right font-bold tabular-nums">{value}</dd></div>)}</dl>;
}
export default function SupplierStockPreview() {
  const [tab, setTab] = useState('return');
  const [payment, setPayment] = useState('paid');
  const [paidRaw, setPaidRaw] = useState('50');
  const [soldRaw, setSoldRaw] = useState('2');
  const [qtyRaw, setQtyRaw] = useState('4');
  const [aRaw, setARaw] = useState('4');
  const [bRaw, setBRaw] = useState('3');
  const [later, setLater] = useState(false);
  const [csRaw, setCsRaw] = useState('6');
  const [cpRaw, setCpRaw] = useState('0');
  const [crRaw, setCrRaw] = useState('0');
  const [message, setMessage] = useState('');
  const edit = (setter: (v: string) => void) => (v: string) => { setter(v); setMessage(''); };
  const sold = Number(soldRaw), qty = Number(qtyRaw), stock = 10 - sold;
  const paid = payment === 'paid' ? 10000 : payment === 'unpaid' ? 0 : Math.round(Number(paidRaw) * 100);
  const revisedCharge = 10000 - qty * 1000;
  const debt = Math.max(revisedCharge - paid, 0), refund = Math.max(paid - revisedCharge, 0);
  const returnsOK = valid(soldRaw, 10) && valid(qtyRaw, stock) && qty > 0 && (payment !== 'part' || (/^\d+(\.\d{1,2})?$/.test(paidRaw) && paid > 0 && paid < 10000));
  const a = Number(aRaw), b = Number(bRaw), missing = 9 - a - b;
  const deliveryOK = valid(aRaw, 5) && valid(bRaw, 4);
  const cs = Number(csRaw), cp = Number(cpRaw), cr = Number(crRaw);
  const consignOK = valid(csRaw, 10) && valid(cpRaw, cs) && valid(crRaw, 10 - cs);
  const reset = () => { setPayment('paid'); setPaidRaw('50'); setSoldRaw('2'); setQtyRaw('4'); setARaw('4'); setBRaw('3'); setLater(false); setCsRaw('6'); setCpRaw('0'); setCrRaw('0'); setMessage(''); };
  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-8 text-slate-900">
    <header className="space-y-3"><p className="text-sm font-bold text-blue-700">TillFlow · Revised supplier stock preview</p><h1 className="text-3xl font-bold">Stock and supplier payments, clearly separated</h1><p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><strong>Fictional design simulation.</strong> Nothing is saved or posted. The working backend is not implemented.</p></header>
    <nav aria-label="Supplier scenarios" className="grid gap-2 sm:grid-cols-3">{[['return', 'Return purchased goods'], ['delivery', 'Goods did not arrive'], ['consign', 'Pay for books sold']].map(([key, title]) => <button type="button" key={key} aria-pressed={tab === key} className={tab === key ? 'btn-primary' : 'btn-ghost'} onClick={() => { setTab(key); setMessage(''); }}>{title}</button>)}</nav>
    <section className="card space-y-5 p-5 sm:p-7">
      {tab === 'return' ? <>
        <h2 className="text-xl font-bold">Return part of a purchase</h2><p className="text-sm text-slate-600">10 books received × GH₵10 supplier cost = GH₵100 invoice. No previous returns. Selling books changes stock, not the original supplier charge.</p>
        <div className="grid gap-6 md:grid-cols-2"><div className="space-y-4"><h3 className="font-bold">1. Enter the facts</h3><label className="block text-sm font-semibold">Payment status<select className="input mt-2" value={payment} onChange={e => edit(setPayment)(e.target.value)}><option value="paid">Fully paid — GH₵100 already paid</option><option value="unpaid">Unpaid — nothing paid</option><option value="part">Part-paid — enter amount paid</option></select></label>{payment === 'part' ? <label className="block text-sm font-semibold">Already paid (GH₵)<input className="input mt-2" inputMode="decimal" value={paidRaw} onChange={e => edit(setPaidRaw)(e.target.value)} /></label> : null}<Field label="Books already sold" value={soldRaw} set={edit(setSoldRaw)} max={10} /><Field label="Books to return now" value={qtyRaw} set={edit(setQtyRaw)} max={Math.max(0, stock)} /></div><div className="space-y-3"><h3 className="font-bold">2. Check the result</h3>{returnsOK ? <><Summary rows={[[ 'Originally received', '10 books' ],['Already sold', `${sold} books`],['Currently in stock', `${stock} books`],['Return now', `${qty} books`],['Stock after return', `${stock - qty} books`],['Value returned', cash(qty * 1000)],['Already paid to supplier', cash(paid)],['You still owe supplier', cash(debt)],['Supplier credit / refund due to you', cash(refund)]]} /><p className="text-xs text-slate-600">{refund > 0 ? 'Agree a refund or keep this as supplier credit. No cash refund has been received.' : 'The return reduces the supplier charge. No cash movement is assumed.'}</p></> : <p role="alert" className="text-sm text-red-700">Enter valid quantities. You cannot return sold books or more than current stock. Part-payment must be above GH₵0 and below GH₵100.</p>}</div></div>
        <button type="button" className="btn-primary" disabled={!returnsOK} onClick={() => setMessage(`Example reviewed: return ${qty} books (${cash(qty * 1000)}); keep ${stock - qty} in stock. You owe ${cash(debt)}; supplier credit/refund due to you ${cash(refund)}. Nothing was posted.`)}>Review this return</button>
      </> : tab === 'delivery' ? <>
        <h2 className="text-xl font-bold">Correct goods recorded but not received</h2><p className="text-sm text-slate-600">Invoice lists Product A: 5 units and Product B: 4 units. Both cost GH₵10 each. This example invoice is unpaid, with no sales.</p>
        <div className="grid gap-6 md:grid-cols-2"><div className="space-y-4"><h3 className="font-bold">1. What actually arrived?</h3><Field label="Product A received — invoice says 5" value={aRaw} set={edit(setARaw)} max={5} /><Field label="Product B received — invoice says 4" value={bRaw} set={edit(setBRaw)} max={4} /><label className="block text-sm font-semibold">Supplier’s agreed response<select className="input mt-2" value={later ? 'later' : 'credit'} onChange={e => { setLater(e.target.value === 'later'); setMessage(''); }}><option value="credit">Cancel missing goods and confirm credit</option><option value="later">Deliver missing goods later</option></select></label></div><div className="space-y-3"><h3 className="font-bold">2. Corrected stock and invoice</h3>{deliveryOK ? <><Summary rows={[[ 'Product A in stock', `${a} units`],['Product A missing', `${5 - a} units`],['Product B in stock', `${b} units`],['Product B missing', `${4 - b} units`],...(later ? [['Still expected from supplier', `${missing} units`],['Invoice charge remains', 'GH₵90.00']] : [['Confirmed supplier credit', cash(missing * 1000)],['You still owe supplier', cash((a + b) * 1000)]]) as [string, string][]]} /><p className="text-xs text-slate-600">{later ? 'Missing goods are expected later, not available stock. No supplier credit is assumed.' : 'Only the missing quantities and their confirmed credit are corrected. Goods that arrived remain in stock.'}</p></> : <p role="alert" className="text-sm text-red-700">Enter whole quantities between zero and the invoice quantity.</p>}</div></div>
        <button type="button" className="btn-primary" disabled={!deliveryOK} onClick={() => setMessage(`Example reviewed: ${a} units of A and ${b} units of B received. ${later ? `${missing} units still expected; invoice remains GH₵90.` : `${cash(missing * 1000)} supplier credit; ${cash((a + b) * 1000)} still owed.`} Nothing was posted.`)}>Review receipt correction</button>
      </> : <>
        <h2 className="text-xl font-bold">Pay the supplier for books sold</h2><p className="text-sm text-slate-600">The supplier leaves 10 books with you. Pay GH₵10 for each book sold. Unsold books can stay with you or be returned.</p>
        <div className="grid gap-6 md:grid-cols-2"><div className="space-y-4"><h3 className="font-bold">1. What happened to these 10 books?</h3><Field label="Books sold" value={csRaw} set={edit(setCsRaw)} max={10} /><Field label="Of those sold, books already paid for" value={cpRaw} set={edit(setCpRaw)} max={Math.max(0, Math.min(cs, 10))} /><Field label="Unsold books to send back now — enter 0 to keep them" value={crRaw} set={edit(setCrRaw)} max={Math.max(0, 10 - cs)} /></div><div className="space-y-3"><h3 className="font-bold">2. Supplier statement</h3>{consignOK ? <><Summary rows={[[ 'Received from supplier', '10 books' ],['Sold', `${cs} books`],['Unsold, currently holding', `${10 - cs} books`],['Sending back now', `${cr} books`],['Keeping in stock', `${10 - cs - cr} books`],['Already paid', `${cash(cp * 1000)} (${cp} books)`],['Sold books still unpaid', `${cs - cp} books`],['Pay supplier now', cash((cs - cp) * 1000)]]} /><p className="text-xs text-slate-600">Returning unsold books is separate from paying for sold books. No refund is created for unsold stock in this example.</p></> : <p role="alert" className="text-sm text-red-700">Use whole quantities. Books paid for cannot exceed books sold. Books returned cannot exceed unsold stock.</p>}</div></div>
        <button type="button" className="btn-primary" disabled={!consignOK} onClick={() => setMessage(`Example reviewed: pay ${cash((cs - cp) * 1000)} for ${cs - cp} sold books; send back ${cr} unsold books; keep ${10 - cs - cr} books. Nothing was posted.`)}>Review supplier payment and return</button>
      </>}
    </section>
    {message ? <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm">{message}</p> : null}
    <footer className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Examples exclude tax, discounts, delivery costs and other stock movements.</p><button type="button" className="btn-ghost" onClick={reset}>Reset examples</button></footer>
  </main>;
}
