export default function ProductIdentityFields({ publisher = '', edition = '', barcodes = [] }: { publisher?: string; edition?: string; barcodes?: string[] }) {
  return <div className="grid gap-4 sm:grid-cols-2">
    <div><label className="label" htmlFor="product-publisher">Publisher / brand</label><input id="product-publisher" name="publisher" className="input" defaultValue={publisher} maxLength={120} /><p className="mt-1 text-xs text-black/50">Distinguishes versions with the same title. Supplier is recorded separately.</p></div>
    <div><label className="label" htmlFor="product-edition">Edition / format</label><input id="product-edition" name="edition" className="input" defaultValue={edition} maxLength={120} placeholder="e.g. Paperback, 2026 edition" /></div>
    <div className="sm:col-span-2"><label className="label" htmlFor="product-extra-barcodes">Additional barcodes for this exact product</label><textarea id="product-extra-barcodes" name="additionalBarcodes" className="input" defaultValue={barcodes.join('\n')} rows={2} /><p className="mt-1 text-xs text-black/50">One code per line. Different publisher versions need separate products and stock records.</p></div>
  </div>;
}
