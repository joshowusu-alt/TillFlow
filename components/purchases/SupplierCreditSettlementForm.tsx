'use client';
import { useState } from 'react';
import { settleSupplierCreditAction } from '@/app/actions/supplier-credit-settlements';
import SubmitButton from '@/components/SubmitButton';
import { formatMoney } from '@/lib/format';

export default function SupplierCreditSettlementForm({ sourceInvoiceId, storeId, requestKey, availablePence, currency, targets, tills }: { sourceInvoiceId: string; storeId: string; requestKey: string; availablePence: number; currency: string; targets: { id: string; label: string; balancePence: number }[]; tills: { id: string; name: string }[] }) {
  const [kind, setKind] = useState('OFFSET');
  const [amount, setAmount] = useState('');
  const pence = /^\d+(\.\d{1,2})?$/.test(amount) ? Math.round(Number(amount) * 100) : 0;
  return <form action={settleSupplierCreditAction} className="card space-y-4 p-5">
    <input type="hidden" name="sourceInvoiceId" value={sourceInvoiceId} /><input type="hidden" name="storeId" value={storeId} /><input type="hidden" name="requestKey" value={requestKey} />
    <h2 className="text-xl font-semibold">Record an actual settlement</h2>
    <label className="label">How was the credit settled?<select className="input mt-1" name="kind" value={kind} onChange={event => setKind(event.target.value)}><option value="OFFSET">Apply to another invoice — no money moves</option><option value="REFUND_BANK">Supplier refund received into bank</option><option value="REFUND_CASH">Supplier refund received into an open till</option></select></label>
    {kind === 'OFFSET' ? <label className="label">Invoice to reduce<select required className="input mt-1" name="targetInvoiceId"><option value="">Choose an invoice for this supplier and branch</option>{targets.map(target => <option key={target.id} value={target.id}>{target.label} · Owed {formatMoney(target.balancePence, currency)}</option>)}</select></label> : <p className="rounded-xl bg-amber-50 p-3 text-sm">Only record money already received. This adds money to {kind === 'REFUND_CASH' ? 'the selected till' : 'the bank ledger'} and reduces the credit owed to you. It does not initiate a bank transfer.</p>}
    {kind === 'REFUND_CASH' ? <label className="label">Till that received the cash<select name="tillId" className="input mt-1" required><option value="">Choose an open till</option>{tills.map(till => <option key={till.id} value={till.id}>{till.name}</option>)}</select></label> : null}
    <label className="label">Amount<input required className="input mt-1" name="amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={event => setAmount(event.target.value)} /></label>
    <p className="text-sm">Unused credit on this invoice: {formatMoney(availablePence, currency)}. Stock and VAT are unchanged by settlement.</p>
    <label className="label">Supplier agreement / bank receipt reference<input required maxLength={500} name="reference" className="input mt-1" /></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmed" required className="mt-1" />{kind === 'OFFSET' ? 'The supplier agreed to apply this credit to the selected invoice.' : 'The refund has actually been received through the selected method.'}</label>
    <SubmitButton className="btn-primary" loadingText="Saving settlement…" disabled={pence <= 0 || pence > availablePence}>Save settlement</SubmitButton>
  </form>;
}
