'use client';
import { useState } from 'react';
export default function ProductIdentityFields({ publisher = '', edition = '', barcodes = [] }: { publisher?: string; edition?: string; barcodes?: string[] }) {
  const [codes, setCodes] = useState<string[]>(barcodes.length ? barcodes : ['']);
  return <div className="grid gap-4 sm:grid-cols-2">
    <div><label className="label" htmlFor="product-publisher">Publisher / brand</label><input id="product-publisher" name="publisher" className="input" defaultValue={publisher} maxLength={120} /><p className="mt-1 text-xs text-black/50">Distinguishes versions with the same title. Supplier is recorded separately.</p></div>
    <div><label className="label" htmlFor="product-edition">Edition / format</label><input id="product-edition" name="edition" className="input" defaultValue={edition} maxLength={120} placeholder="e.g. Paperback, 2026 edition" /></div>
    <div className="sm:col-span-2"><label className="label" htmlFor="product-extra-barcodes">Additional barcodes for this exact product</label><input type="hidden" name="additionalBarcodes" value={codes.filter(code => code.trim()).join('\n')} />
      {codes.map((code, index) => <div key={index} className="mt-2 flex gap-2"><input id={index === 0 ? 'product-extra-barcodes' : undefined} aria-label={`Additional barcode ${index + 1}`} className="input min-w-0" value={code} onChange={event => setCodes(current => current.map((item, i) => i === index ? event.target.value : item))} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} /><button type="button" className="btn-ghost" aria-label={`Remove barcode ${index + 1}`} onClick={() => setCodes(current => current.filter((_, i) => i !== index))}>Remove</button></div>)}
      <button type="button" className="btn-secondary mt-2" disabled={codes.length >= 49} onClick={() => setCodes(current => [...current, ''])}>Add another barcode</button><p className="mt-1 text-xs text-black/50">These codes share this product’s stock. Create a separate product when its stock or price needs tracking separately.</p></div>
  </div>;
}
