'use client';

import { useState } from 'react';
import SubmitButton from '@/components/SubmitButton';
import StableIdempotencyKeyInput from '@/components/StableIdempotencyKeyInput';
import { recordExpensePaymentAction } from '@/app/actions/expense-payments';

type OpenTillOption = { tillId: string; tillName: string; shiftId: string };

export default function ExpensePaymentForm({
  expenseId,
  openTills,
  remainingPence,
}: {
  expenseId: string;
  openTills: OpenTillOption[];
  remainingPence: number;
}) {
  const [method, setMethod] = useState('CASH');
  const showTill = method === 'CASH';
  const defaultAmount = remainingPence > 0 ? (remainingPence / 100).toFixed(2) : '';

  return (
    <form action={recordExpensePaymentAction} className="grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="expenseId" value={expenseId} />
      <StableIdempotencyKeyInput scope={`expense-payment:${expenseId}`} />
      <div>
        <div className="text-xs text-black/50">Payment method</div>
        <select className="input" name="method" value={method} onChange={(event) => setMethod(event.target.value)}>
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
          <option value="TRANSFER">Transfer</option>
          <option value="MOBILE_MONEY">Mobile Money</option>
        </select>
      </div>
      {showTill ? (
        <div>
          <div className="text-xs text-black/50">Till (cash from this drawer)</div>
          <select
            className="input"
            name="tillId"
            required={openTills.length > 0}
            defaultValue={openTills.length === 1 ? openTills[0].tillId : ''}
          >
            {openTills.length === 0 ? (
              <option value="">No open till — open a till for cash</option>
            ) : (
              <>
                {openTills.length > 1 ? <option value="">Select till…</option> : null}
                {openTills.map((till) => (
                  <option key={till.tillId} value={till.tillId}>
                    {till.tillName}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
      ) : null}
      <div>
        <div className="text-xs text-black/50">Amount</div>
        <input
          className="input"
          name="amount"
          type="number"
          min={0}
          max={remainingPence / 100}
          step="0.01"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={defaultAmount}
        />
      </div>
      <div className="sm:col-span-2">
        <div className="text-xs text-black/50">Reference (optional)</div>
        <input className="input" name="reference" placeholder="Receipt / transaction ref" />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton className="btn-primary w-full text-xs" loadingText="Recording…">
          Record payment
        </SubmitButton>
      </div>
    </form>
  );
}
