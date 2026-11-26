import Link from 'next/link';
import DeletePurchaseButton from './DeletePurchaseButton';

export default function PurchaseRowMenu({ id, canEdit, canPay, canReturn }: { id: string; canEdit: boolean; canPay: boolean; canReturn: boolean }) {
  const href = `/purchases/${id}`;
  return <details className="relative text-left">
    <summary aria-label="Purchase actions" className="btn-ghost cursor-pointer list-none text-lg font-bold">⋯</summary>
    <div className="mt-1 grid min-w-28 gap-1 rounded-xl border bg-white p-2 shadow-sm">
      <Link className="btn-ghost text-xs" href={href}>View</Link>
      {canEdit && <Link className="btn-ghost text-xs" href={`${href}?edit=1#edit-purchase`}>Edit</Link>}
      {canPay && <Link className="btn-ghost text-xs" href={`${href}#record-payment`}>Pay</Link>}
      {canReturn && <><Link className="btn-ghost text-xs" href={`/purchases/partial-return/${id}`}>Return</Link><DeletePurchaseButton purchaseId={id} /></>}
    </div>
  </details>;
}
