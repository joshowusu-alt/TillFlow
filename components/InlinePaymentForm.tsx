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

export default function InlinePaymentForm({ invoiceId, outstandingPence, currency, type, returnTo }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const action = type === 'customer' ? recordCustomerPaymentAction : recordSupplierPaymentAction;
  const outstanding = (outstandingPence / 100).toFixed(2);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
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
      <select name="paymentMethod" className="input py-1 text-xs w-20" defaultValue="CASH">
        <option value="CASH">Cash</option>
        <option value="CARD">Card</option>
        <option value="MOMO">MoMo</option>
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
      />
      <button
        type="submit"
        disabled={submitting}
        className="btn-primary py-1 px-2 text-xs"
      >
        {submitting ? '...' : '✓'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="btn-ghost py-1 px-2 text-xs text-muted"
      >
        ✕
      </button>
    </form>
  );
}
