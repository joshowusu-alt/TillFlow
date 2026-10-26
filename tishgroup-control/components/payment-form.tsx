'use client';

import { useMemo, useState } from 'react';
import { recordControlPaymentAction } from '@/app/actions/control-businesses';
import ConfirmSubmitButton from '@/components/confirm-submit-button';

type PaymentFormBusiness = {
  id: string;
  billingCadence: 'MONTHLY' | 'ANNUAL';
  outstandingAmount: number;
};

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function PaymentForm({
  business,
  recommendedAmount,
}: {
  business: PaymentFormBusiness;
  recommendedAmount: number;
}) {
  const [amount, setAmount] = useState('');
  const [idempotencyKey] = useState(createIdempotencyKey);
  const recommendedLabel = `GHS ${recommendedAmount.toLocaleString('en-GH')}${business.billingCadence === 'ANNUAL' ? '/year' : '/month'}`;
  const confirmMessage = useMemo(() => {
    const entered = amount.trim();
    const enteredLabel = entered ? `GHS ${Number(entered).toLocaleString('en-GH')}` : '(blank — will be rejected)';
    return [
      'Record this payment?',
      '',
      `Amount entered: ${enteredLabel}`,
      `Recommended: ${recommendedLabel}`,
      '',
      'Partial payments do not automatically grant paid access or zero the outstanding balance.',
    ].join('\n');
  }, [amount, recommendedLabel]);

  return (
    <form action={recordControlPaymentAction} className="space-y-3 rounded-2xl border border-black/8 bg-white/80 p-4">
      <input type="hidden" name="businessId" value={business.id} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div>
        <h3 className="text-sm font-semibold text-control-ink">Record payment</h3>
        <p className="mt-1 text-sm text-black/60">This creates a payment record and restores Tillflow entitlement state immediately.</p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">Amount</span>
        <input
          type="number"
          min={1}
          required
          name="amountPence"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder=""
          className="control-field"
        />
        <span className="block text-xs text-black/55">
          Recommended: {recommendedLabel}. Amount must be explicit and greater than zero. Blank will be rejected. Will not default to list price.
        </span>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">Method</span>
        <select name="method" defaultValue="MOMO" className="control-field">
          <option value="MOMO">MoMo</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="CASH">Cash</option>
          <option value="INVOICE">Invoice</option>
        </select>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">Billing cadence</span>
        <select name="billingCadence" defaultValue={business.billingCadence} className="control-field">
          <option value="MONTHLY">Monthly</option>
          <option value="ANNUAL">Annual</option>
        </select>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">Paid at</span>
        <input type="date" name="paidAt" defaultValue={new Date().toISOString().slice(0, 10)} className="control-field" />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">Next due date</span>
        <input type="date" name="nextDueDate" defaultValue="" className="control-field" />
        <p className="text-xs text-black/55">Leave blank to calculate it automatically from the payment date.</p>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">Reference</span>
        <input type="text" name="reference" required placeholder="Transaction or receipt reference" className="control-field" />
        <span className="block text-xs text-black/55">Required for idempotency. Repeat submissions with the same reference should not create a second payment.</span>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">Payment note</span>
        <textarea name="note" rows={3} placeholder="Anything important about this payment or recovery step" className="control-field" />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">Customer-facing billing note (optional — merchants can see this)</span>
        <textarea
          name="customerFacingNote"
          rows={3}
          placeholder="Shown on the merchant billing page"
          className="control-field"
        />
      </label>

      <ConfirmSubmitButton
        className="inline-flex w-full items-center justify-center rounded-2xl bg-control-teal px-4 py-3 text-sm font-semibold text-white transition hover:bg-control-teal-dark disabled:cursor-not-allowed disabled:opacity-65 sm:w-fit"
        confirmMessage={confirmMessage}
        pendingLabel="Recording..."
      >
        Record payment
      </ConfirmSubmitButton>
    </form>
  );
}
