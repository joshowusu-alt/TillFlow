export default function PurchaseDocuments({invoiceId,documents}:{invoiceId:string;documents:{id:string;originalFilename:string;createdAt:string;documentKind?:string}[];awaitingInvoice?:boolean}) {
  if (!documents.length) return null;
  return <section className="card space-y-3 p-5"><h2 className="font-semibold">Saved documents</h2><ul className="space-y-2">{documents.map(d=><li key={d.id}><a className="text-sm font-semibold text-accent underline" href={`/api/purchases/${invoiceId}/documents/${d.id}`} target="_blank" rel="noreferrer">{d.originalFilename}</a><span className="ml-2 text-xs text-black/50">{d.documentKind==='DELIVERY_NOTE'?'Delivery note':'Invoice'} · Added {new Date(d.createdAt).toLocaleDateString('en-GB',{timeZone:'UTC'})}</span></li>)}</ul></section>;
}
