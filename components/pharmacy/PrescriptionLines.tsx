'use client';
import { useState } from 'react';

export default function PrescriptionLines({ products }: { products: { id: string; name: string }[] }) {
  const [lines, setLines] = useState([{ productId: '', authorisedQtyBase: '1', directions: '' }]);
  const [search, setSearch] = useState('');
  return <fieldset className="space-y-3 rounded-xl border p-3"><legend className="px-1 font-semibold">Prescribed medicines</legend>
    <label className="label">Find a medicine<input className="input mt-1 normal-case tracking-normal font-normal" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search medicine names" /></label>
    {lines.map((line, index) => <div key={index} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
      <label className="label">Medicine<select required className="input mt-1 normal-case tracking-normal font-normal" value={line.productId} onChange={event => setLines(lines.map((row, at) => at === index ? { ...row, productId: event.target.value } : row))}><option value="">Choose medicine</option>{products.filter(product => product.id === line.productId || product.name.toLowerCase().includes(search.toLowerCase())).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
      <label className="label">Authorised quantity (base units)<input required type="number" min="1" step="1" className="input mt-1 normal-case tracking-normal font-normal" value={line.authorisedQtyBase} onChange={event => setLines(lines.map((row, at) => at === index ? { ...row, authorisedQtyBase: event.target.value } : row))} /></label>
      <label className="label sm:col-span-2">Directions exactly as prescribed<textarea required className="input mt-1 normal-case tracking-normal font-normal" maxLength={1000} value={line.directions} onChange={event => setLines(lines.map((row, at) => at === index ? { ...row, directions: event.target.value } : row))} /></label>
      {lines.length > 1 ? <button type="button" className="btn-ghost" onClick={() => setLines(lines.filter((_, at) => at !== index))}>Remove medicine</button> : null}
    </div>)}
    <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />
    <button type="button" className="btn-ghost" onClick={() => setLines([...lines, { productId: '', authorisedQtyBase: '1', directions: '' }])} disabled={lines.length >= 50}>Add prescribed medicine</button>
  </fieldset>;
}
