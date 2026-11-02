'use client';
import { useState } from 'react';
import { allocatedReturnValue, partialReturnSettlement } from '@/lib/purchases/partial-return';
import { recordPartialPurchaseReturnAction } from '@/app/actions/partial-purchase-returns';
import SubmitButton from '@/components/SubmitButton';
import { formatMoney } from '@/lib/format';

export type ReturnSourceLine = { id: string; name: string; qtyBase: number; alreadyReturned: number; onHand: number; subtotalPence: number; vatPence: number; baseUnit: string };
export default function PartialPurchaseReturnForm({ invoiceId, storeId, totalPence, paidPence, previousCreditPence, creditSettledPence = 0, creditAppliedPence = 0, currency, lines, requestKey }: { invoiceId: string; storeId: string; totalPence: number; paidPence: number; previousCreditPence: number; creditSettledPence?: number; creditAppliedPence?: number; currency: string; lines: ReturnSourceLine[]; requestKey: string }) {
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
  const result = partialReturnSettlement({ invoiceTotalPence: totalPence, paidPence, previousCreditsPence: previousCreditPence, creditSettledPence, creditAppliedPence, newCreditPence: Math.min(credit, totalPence - previousCreditPence) });
  const selectedLines = lines.filter(line => {
    const raw = quantities[line.id] ?? '';
    const qty = Number(raw);
    return /^\d+$/.test(raw) && Number.isSafeInteger(qty) && qty > 0 && qty <= Math.min(line.qtyBase - line.alreadyReturned, line.onHand);
  }).length;
  return <form action={recordPartialPurchaseReturnAction} aria-label="Selected item purchase return" className="card overflow-hidden">
    <input type="hidden" name="invoiceId" value={invoiceId} /><input type="hidden" name="storeId" value={storeId} /><input type="hidden" name="requestKey" value={requestKey} />
    <section className="space-y-4 p-4 sm:p-6" aria-labelledby="return-items-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-700">1 · Choose items</p><h2 id="return-items-heading" className="mt-1 text-xl font-semibold">What are you returning?</h2></div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600" aria-live="polite">{selectedLines} {selectedLines === 1 ? 'item' : 'items'} selected</span>
      </div>
      <p className="text-sm leading-relaxed text-slate-600">Enter a quantity only for the items you are returning. Leave everything else blank.</p>
      <div className="space-y-3">{lines.map(line => {
        const raw = quantities[line.id] ?? '';
        const qty = Number(raw);
        const limit = Math.max(0, Math.min(line.qtyBase - line.alreadyReturned, line.onHand));
        const hasValue = raw !== '' && raw !== '0';
        const hasError = hasValue && (!/^\d+$/.test(raw) || !Number.isSafeInteger(qty) || qty <= 0 || qty > limit);
        const selected = hasValue && !hasError;
        const itemCredit = selected ? allocatedReturnValue(line.subtotalPence, line.qtyBase, line.alreadyReturned, qty) + allocatedReturnValue(line.vatPence, line.qtyBase, line.alreadyReturned, qty) : 0;
        const inputId = `return-qty-${line.id}`;
        return <div key={line.id} className={`rounded-xl border p-4 transition-colors ${hasError ? 'border-red-300 bg-red-50/40' : selected ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white'}`}>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <div className="min-w-0"><h3 className="break-words font-semibold text-slate-900">{line.name}</h3>
              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                <div><dt>Received</dt><dd className="mt-0.5 font-semibold text-slate-800">{line.qtyBase}</dd></div>
                <div><dt>Already returned</dt><dd className="mt-0.5 font-semibold text-slate-800">{line.alreadyReturned}</dd></div>
                <div><dt>In branch stock</dt><dd className="mt-0.5 font-semibold text-slate-800">{line.onHand}</dd></div>
              </dl>
              {selected ? <p className="mt-3 text-sm font-medium text-blue-800">Credit for this item: {formatMoney(itemCredit, currency)}</p> : null}
            </div>
            <div><label className="block text-xs font-semibold text-slate-700" htmlFor={inputId}>Return now <span className="font-normal">({line.baseUnit})</span></label>
              <input id={inputId} aria-label={`Return quantity for ${line.name}`} aria-describedby={`${inputId}-help`} aria-invalid={hasError} className="input mt-2 text-lg font-semibold tabular-nums" type="text" inputMode="numeric" name={`qty:${line.id}`} value={raw} placeholder="0" disabled={limit === 0} onChange={event => setQuantities(previous => ({ ...previous, [line.id]: event.target.value }))} />
              <p id={`${inputId}-help`} className={`mt-2 text-xs ${hasError ? 'font-medium text-red-700' : 'text-slate-500'}`}>{hasError ? `Enter a whole number from 0 to ${limit}.` : limit === 0 ? 'Nothing available to return.' : `Maximum: ${limit}`}</p>
            </div>
          </div>
        </div>;
      })}</div>
      {credit > totalPence - previousCreditPence ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">The selected credit exceeds the remaining invoice value. Check the quantities before saving.</p> : null}
    </section>
    <section className="space-y-4 border-t border-slate-100 p-4 sm:p-6" aria-labelledby="return-details-heading">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-700">2 · Supplier details</p><h2 id="return-details-heading" className="mt-1 text-xl font-semibold">Why is this being returned?</h2></div>
      <label className="label">Reason type<select className="input mt-2" name="kind"><option value="RETURN">Goods physically returned to supplier</option><option value="SHORT_DELIVERY_CREDIT">Goods never received — supplier confirms cancellation and credit</option></select></label>
      <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">If the supplier will deliver missing goods later, keep them outstanding. Record a credit here only when the supplier has confirmed it.</p>
      <label className="label">Reason / supplier credit reference<input required maxLength={500} name="reason" className="input mt-2" placeholder="e.g. Damaged items — supplier credit note 1042" value={reason} onChange={event => setReason(event.target.value)} /></label>
    </section>
    <section className="space-y-4 border-t border-blue-100 bg-blue-50/50 p-4 sm:p-6" aria-labelledby="return-review-heading">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-700">3 · Review and save</p><h2 id="return-review-heading" className="mt-1 text-xl font-semibold">Check the result</h2></div>
      <div className="rounded-xl border border-blue-100 bg-white p-4"><p className="text-sm text-slate-600">Credit being recorded</p><p className="mt-1 text-3xl font-bold tabular-nums text-blue-900">{formatMoney(credit, currency)}</p><p className="mt-1 text-xs text-slate-500">Any VAT on the selected items is included.</p></div>
      <dl className="grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-slate-600">Already paid on invoice</dt><dd className="mt-1 font-semibold tabular-nums">{formatMoney(paidPence, currency)}</dd></div><div><dt className="text-slate-600">Still owed after this return</dt><dd className="mt-1 font-semibold tabular-nums">{formatMoney(result.supplierDebtPence, currency)}</dd></div><div><dt className="text-slate-600">Credit due from supplier</dt><dd className="mt-1 font-semibold tabular-nums text-blue-900">{formatMoney(result.supplierCreditPence, currency)}</dd></div></dl>
      <p className="text-sm leading-relaxed text-slate-600">Saving records the return and supplier credit together. Record any refund separately after the money is received.</p>
      <div className="space-y-2 pt-1"><SubmitButton className="btn-primary w-full justify-center sm:w-auto" disabled={!valid || count === 0 || !reason.trim()} loadingText="Saving return…">Save selected return and supplier credit</SubmitButton>
        {count === 0 ? <p className="text-xs text-slate-500">Choose item quantities to continue.</p> : !reason.trim() ? <p className="text-xs text-slate-500">Add a reason or supplier credit reference to save.</p> : null}
      </div>
    </section>
  </form>;
}
