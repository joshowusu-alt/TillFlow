'use client';
import { useState } from 'react';
import { allocatedReturnValue, partialReturnSettlement } from '@/lib/purchases/partial-return';
import { recordPartialPurchaseReturnAction } from '@/app/actions/partial-purchase-returns';
import SubmitButton from '@/components/SubmitButton';
import { formatMoney } from '@/lib/format';

export type ReturnSourceLine = { id: string; name: string; qtyBase: number; alreadyReturned: number; onHand: number; subtotalPence: number; vatPence: number; baseUnit: string };
export default function PartialPurchaseReturnForm({ invoiceId, storeId, totalPence, paidPence, previousCreditPence, currency, lines, requestKey }: { invoiceId: string; storeId: string; totalPence: number; paidPence: number; previousCreditPence: number; currency: string; lines: ReturnSourceLine[]; requestKey: string }) {
  const [quantities, setQuantities] = useState<Record<string,string>>({});
  const [reason, setReason] = useState('');
  let credit = 0, valid = true, count = 0;
  for (const line of lines) {
    const raw = quantities[line.id] ?? '';
    if (!raw || raw === '0') continue;
    const qty = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(qty) || qty <= 0 || qty > line.qtyBase - line.alreadyReturned || qty > line.onHand) { valid = false; continue; }
    count += qty;
    credit += allocatedReturnValue(line.subtotalPence, line.qtyBase, line.alreadyReturned, qty) + allocatedReturnValue(line.vatPence, line.qtyBase, line.alreadyReturned, qty);
  }
  valid = valid && credit <= totalPence - previousCreditPence;
  const result = partialReturnSettlement({ invoiceTotalPence: totalPence, paidPence, previousCreditsPence: previousCreditPence, newCreditPence: Math.min(credit, totalPence - previousCreditPence) });
  return <form action={recordPartialPurchaseReturnAction} className="card space-y-5 p-5">
    <input type="hidden" name="invoiceId" value={invoiceId} /><input type="hidden" name="storeId" value={storeId} /><input type="hidden" name="requestKey" value={requestKey} />
    <h2 className="text-xl font-semibold">Choose quantities from this purchase</h2><p className="text-sm text-slate-600">Original quantities and payments are loaded from TillFlow. Quantities below are base units. Current stock includes all receipts, sales and adjustments in this branch.</p>
    <div className="space-y-3">{lines.map(line => <label key={line.id} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_9rem]"><span><strong>{line.name}</strong><span className="mt-1 block text-xs text-slate-600">Received: {line.qtyBase} · Previously returned: {line.alreadyReturned} · In branch stock: {line.onHand} · Unit: {line.baseUnit}</span></span><span className="text-xs font-semibold">Return now<input className="input mt-1" type="text" inputMode="numeric" name={`qty:${line.id}`} value={quantities[line.id] ?? ''} placeholder="0" onChange={event => setQuantities(previous => ({ ...previous, [line.id]: event.target.value }))} /></span></label>)}</div>
    {!valid ? <p role="alert" className="text-sm text-red-700">Enter whole quantities no greater than the remaining invoice quantity or branch stock.</p> : null}
    <label className="label">Reason type<select className="input mt-1" name="kind"><option value="RETURN">Goods physically returned to supplier</option><option value="SHORT_DELIVERY_CREDIT">Goods never received — supplier confirms cancellation and credit</option></select></label>
    <p className="text-xs text-slate-600">If the supplier will deliver the missing goods later, do not record a supplier credit here. This pilot supports confirmed credits only.</p>
    <label className="label">Reason / supplier credit reference<input required maxLength={500} name="reason" className="input mt-1" value={reason} onChange={event => setReason(event.target.value)} /></label>
    <dl className="grid gap-3 rounded-xl bg-blue-50 p-4 sm:grid-cols-2"><div><dt>Selected return value</dt><dd className="text-xl font-bold">{formatMoney(credit, currency)}</dd></div><div><dt>Already paid on invoice</dt><dd>{formatMoney(paidPence, currency)}</dd></div><div><dt>Supplier debt after return</dt><dd className="font-bold">{formatMoney(result.supplierDebtPence, currency)}</dd></div><div><dt>Supplier credit / refund due to you</dt><dd className="font-bold">{formatMoney(result.supplierCreditPence, currency)}</dd></div></dl>
    <p className="text-sm">No cash receipt is recorded. A supplier credit reduces debt or creates a credit due back to the business.</p>
    <SubmitButton className="btn-primary" disabled={!valid || count === 0 || !reason.trim()} loadingText="Saving return…">Save selected return and supplier credit</SubmitButton>
  </form>;
}
