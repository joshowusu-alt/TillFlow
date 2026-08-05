'use client';

import { useState, useRef } from 'react';
import { recordCustomerPaymentAction } from '@/app/actions/payments';
import { recordSupplierPaymentAction } from '@/app/actions/payments';

type Props = {
  invoiceId: string;
  outstandingPence: number;
  currency: string;
  type: 'customer' | 'supplier';
  returnTo: string;
};

function newIdempotencyKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function InlinePaymentForm({ invoiceId, outstandingPence, currency, type, returnTo }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const formRef = useRef<HTMLFormElement>(null);

  const action = type === 'customer' ? recordCustomerPaymentAction : recordSupplierPaymentAction;
  const outstanding = (outstandingPence / 100).toFixed(2);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setIdempotencyKey(newIdempotencyKey());
          setSubmitting(false);
          setOpen(true);
        }}
        className="btn-ghost text-xs text-primary font-semibold"
      >
        {type === 'customer' ? 'Collect' : 'Pay'}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={() => setSubmitting(true)}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {type === 'supplier' ? (
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      ) : null}
      <select name="paymentMethod" className="input py-1 text-xs w-20" defaultValue="CASH">
        <option value="CASH">Cash</option>
        <option value="CARD">Card</option>
        <option value="MOBILE_MONEY">MoMo</option>
        <option value="TRANSFER">Transfer</option>
      </select>
      <input
        name="amount"
        type="number"
        step="0.01"
        min="0.01"
        defaultValue={outstanding}
        className="input py-1 text-xs w-20"
        placeholder="Amt"
        aria-label={`Amount (${currency})`}
      />
      <button
        type="submit"
        disabled={submitting}
        className="btn-primary py-1 px-2 text-xs"
      >
        {submitting ? '…' : 'Confirm'}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setSubmitting(false);
        }}
        className="btn-ghost py-1 px-2 text-xs text-muted"
      >
        Cancel
      </button>
    </form>
  );
}
