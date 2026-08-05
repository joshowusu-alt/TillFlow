'use client';

import { useState } from 'react';
import SubmitButton from '@/components/SubmitButton';
import { recordSupplierPaymentAction } from '@/app/actions/payments';

type Props = {
  invoiceId: string;
  returnTo?: string;
  today: string;
  amountPlaceholder?: string;
  /** Optional form layout class; defaults to supplier-payments grid. */
  formClassName?: string;
};

/**
 * Supplier payment form with a durable client idempotency key per intentional submission.
 * Server + DB uniqueness remain authoritative; pending disable is defence in depth.
 */
export default function SupplierPaymentForm({
  invoiceId,
  returnTo,
  today,
  amountPlaceholder = '0.00',
  formClassName = 'grid gap-2 md:grid-cols-2',
}: Props) {
  const [idempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `sp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  return (
    <form action={recordSupplierPaymentAction} className={formClassName}>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <div>
        <div className="text-xs font-medium text-black/50">Payment method</div>
        <select className="input" name="paymentMethod" defaultValue="CASH">
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
          <option value="TRANSFER">Bank Transfer</option>
          <option value="MOBILE_MONEY">Mobile Money (MoMo)</option>
        </select>
      </div>
      <div>
        <div className="text-xs font-medium text-black/50">Amount paid</div>
        <input
          className="input"
          name="amount"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          placeholder={amountPlaceholder}
        />
      </div>
      <div>
        <div className="text-xs font-medium text-black/50">Payment date</div>
        <input
          className="input"
          name="paidAt"
          type="date"
          defaultValue={today}
        />
      </div>
      <div>
        <div className="text-xs font-medium text-black/50">Notes (optional)</div>
        <input
          className="input"
          name="notes"
          type="text"
          placeholder="e.g. cheque #1234"
        />
      </div>
      <div className="text-xs text-black/45 md:col-span-2 sm:col-span-2 lg:col-span-4">
        Enter the amount paid. Do not exceed the amount owed.
      </div>
      <div className="flex items-end md:col-span-2 sm:col-span-2 lg:col-span-4">
        <SubmitButton className="btn-primary w-full text-xs sm:w-auto sm:text-sm" loadingText="Recording…">
          Record payment
        </SubmitButton>
      </div>
    </form>
  );
}
