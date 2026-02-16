'use client';

import { useState } from 'react';
import { formatMoney } from '@/lib/format';
import { createSalesReturnAction } from '@/app/actions/returns';

type ReturnFormClientProps = {
  invoiceId: string;
  paid: number;
  currency: string;
  isVoid: boolean;
};

export default function ReturnFormClient({
  invoiceId,
  paid,
  currency,
  isVoid
}: ReturnFormClientProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [refundMethod, setRefundMethod] = useState('CASH');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const formData = new FormData();
    formData.set('salesInvoiceId', invoiceId);
    formData.set('refundAmountPence', String(paid));
    formData.set('type', isVoid ? 'VOID' : 'RETURN');
    formData.set('refundMethod', refundMethod);
    formData.set('reason', reason);
    await createSalesReturnAction(formData);
  };

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {!isVoid ? (
          <>
            <div>
              <label className="label">Refund Method</label>
              <select
                className="input"
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value)}
              >
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="TRANSFER">Transfer</option>
                <option value="MOBILE_MONEY">Mobile Money</option>
              </select>
            </div>
            <div>
              <label className="label">Refund Amount</label>
              <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold">
                {formatMoney(paid, currency)}
              </div>
            </div>
          </>
        ) : (
          <div className="md:col-span-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No payments received. This will void the sale and restore stock.
          </div>
        )}
        <div className="md:col-span-3">
          <label className="label">Reason (optional)</label>
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for return/void"
          />
        </div>
        <div className="md:col-span-3">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowConfirm(true)}
          >
            {isVoid ? 'Void Sale' : 'Process Return'}
          </button>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
                <svg
                  className="h-6 w-6 text-rose-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-display font-semibold">
                  Confirm {isVoid ? 'Void' : 'Return'}
                </h3>
                <p className="text-sm text-black/60">This action cannot be undone.</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-black/10 bg-black/5 p-4 text-sm">
              {isVoid ? (
                <p>
                  This will <strong>void the sale</strong> and restore all items
                  back to inventory.
                </p>
              ) : (
                <p>
                  This will <strong>process a full return</strong> of{' '}
                  <strong>{formatMoney(paid, currency)}</strong> via {refundMethod.toLowerCase()}{' '}
                  and restore all items to inventory.
                </p>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className="btn-ghost flex-1"
                onClick={() => setShowConfirm(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Processing...' : isVoid ? 'Void Sale' : 'Confirm Return'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
