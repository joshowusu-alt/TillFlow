'use client';
import { useState } from 'react';
import { parseProductAttributes, type ProductAttribute } from '@/lib/products/attributes';
export default function ProductIdentityFields({ publisher = '', edition = '', barcodes = [], attributesJson }: { publisher?: string; edition?: string; barcodes?: string[]; attributesJson?: string | null }) {
  const [details, setDetails] = useState<ProductAttribute[]>(() => attributesJson ? parseProductAttributes(attributesJson) : [...(publisher ? [{label:'Brand / publisher',value:publisher}] : []), ...(edition ? [{label:'Edition / format',value:edition}] : [])]);
  const [codes, setCodes] = useState<string[]>(barcodes);
  const legacy = (label: RegExp) => details.find(item => label.test(item.label))?.value.slice(0,120) ?? '';
  return <div className="space-y-4">
    <input type="hidden" name="attributesJson" value={JSON.stringify(details)} />
    <input type="hidden" name="publisher" value={legacy(/brand|publisher/i)} /><input type="hidden" name="edition" value={legacy(/edition|format/i)} />
    <div><p className="text-sm font-semibold">Product details</p><p className="mt-1 text-xs text-black/55">Choose your own labels: brand, author, size, colour, subject or anything else. You can repeat a label.</p>
      {details.map((detail,index) => <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]" key={index}><input className="input" aria-label={`Detail ${index+1} label`} placeholder="Label, e.g. Author" maxLength={60} value={detail.label} onChange={e => setDetails(current => current.map((item,i) => i===index ? {...item,label:e.target.value}:item))} /><input className="input" aria-label={`Detail ${index+1} value`} placeholder="Value" maxLength={240} value={detail.value} onChange={e => setDetails(current => current.map((item,i) => i===index ? {...item,value:e.target.value}:item))} /><button className="btn-ghost" type="button" onClick={() => setDetails(current => current.filter((_,i)=>i!==index))} aria-label={`Remove detail ${index+1}`}>Remove</button></div>)}
      <button type="button" className="btn-secondary mt-3" disabled={details.length>=50} onClick={() => setDetails(current => [...current,{label:'',value:''}])}>Add another detail</button>
    </div>
    <details><summary className="cursor-pointer text-sm font-medium">Additional barcodes (optional)</summary><p className="mt-2 text-xs text-black/55">Codes for this exact product, sharing the same stock and price.</p><input type="hidden" name="additionalBarcodes" value={codes.filter(code => code.trim()).join('\n')} />
      {codes.map((code,index) => <div className="mt-2 flex gap-2" key={index}><input aria-label={`Additional barcode ${index+1}`} className="input min-w-0" value={code} onChange={e => setCodes(current => current.map((item,i) => i===index ? e.target.value:item))} onKeyDown={e => {if(e.key==='Enter')e.preventDefault();}} /><button type="button" className="btn-ghost" onClick={() => setCodes(current => current.filter((_,i)=>i!==index))}>Remove</button></div>)}<button type="button" className="btn-secondary mt-2" disabled={codes.length>=49} onClick={() => setCodes(current=>[...current,''])}>Add another barcode</button>
    </details>
  </div>;
}
