'use client';

import { useState } from 'react';
import { formatMoney } from '@/lib/format';
import { createSalesReturnAction } from '@/app/actions/returns';
import { VOID_RETURN_REASON_CODES } from '@/lib/fraud/reason-codes';

type ReturnFormClientProps = {
  invoiceId: string;
  paid: number;
  currency: string;
  isVoid: boolean;
  userRole?: string;
};

export default function ReturnFormClient({
  invoiceId,
  paid,
  currency,
  isVoid,
  userRole
}: ReturnFormClientProps) {
  const isOwner = userRole === 'OWNER';
  const [showConfirm, setShowConfirm] = useState(false);
  const [refundMethod, setRefundMethod] = useState('CASH');
  const [reasonCode, setReasonCode] = useState('');
  const [reason, setReason] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenConfirm = () => {
    if (!reasonCode) {
      setFormError('Select a reason code before continuing.');
      return;
    }
    if (!isOwner && !managerPin.trim()) {
      setFormError('Manager PIN is required.');
      return;
    }
    setFormError(null);
    setShowConfirm(true);
  };

  const handleSubmit = async () => {
    setFormError(null);
    setIsSubmitting(true);
    const formData = new FormData();
    formData.set('salesInvoiceId', invoiceId);
    formData.set('refundAmountPence', String(paid));
    formData.set('type', isVoid ? 'VOID' : 'RETURN');
    formData.set('refundMethod', refundMethod);
    formData.set('reasonCode', reasonCode);
    formData.set('reason', reason);
    formData.set('managerPin', managerPin.trim());
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
        <div>
          <label className="label">Reason Code</label>
          <select
            className="input"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
          >
            <option value="">Select reason code</option>
            {VOID_RETURN_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {code.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        {!isOwner && (
          <div>
            <label className="label">Manager PIN</label>
            <input
              className="input"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={managerPin}
              onChange={(e) => setManagerPin(e.target.value)}
              placeholder="Enter manager PIN"
            />
          </div>
        )}
        {isOwner && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Owner approval — no PIN required.
          </div>
        )}
        <div className="md:col-span-3">
          <label className="label">Reason details (optional)</label>
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for return/void"
          />
        </div>
        {formError ? (
          <div className="md:col-span-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {formError}
          </div>
        ) : null}
        <div className="md:col-span-3">
          <button
            type="button"
            className="btn-primary"
            onClick={handleOpenConfirm}
          >
            {isVoid ? 'Void Sale' : 'Process Return'}
          </button>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 overflow-y-auto flex-1">
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
            </div>
            <div className="mt-4 p-6 pt-0 flex gap-3 flex-shrink-0">
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
