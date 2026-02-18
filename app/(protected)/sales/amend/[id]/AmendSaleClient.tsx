'use client';

import { useState } from 'react';
import { formatMoney } from '@/lib/format';
import { amendSaleAction } from '@/app/actions/sales';

type LineItem = {
  id: string;
  productId: string;
  productName: string;
  unitName: string;
  qtyInUnit: number;
  unitPricePence: number;
  lineDiscountPence: number;
  promoDiscountPence: number;
  lineTotalPence: number;
  lineVatPence: number;
};

type Props = {
  invoiceId: string;
  lines: LineItem[];
  totalPence: number;
  totalPaid: number;
  currency: string;
};

export default function AmendSaleClient({
  invoiceId,
  lines,
  totalPence,
  totalPaid,
  currency,
}: Props) {
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('CASH');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const keptLines = lines.filter((l) => !removedIds.has(l.id));
  const removedLines = lines.filter((l) => removedIds.has(l.id));

  const newTotal = keptLines.reduce((sum, l) => sum + l.lineTotalPence, 0);
  const removedTotal = removedLines.reduce((sum, l) => sum + l.lineTotalPence, 0);
  const refundAmount = Math.max(totalPaid - newTotal, 0);

  const canSubmit = removedIds.size > 0 && keptLines.length > 0;

  const toggleRemove = (lineId: string) => {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        // Don't allow removing all items
        if (keptLines.length <= 1 && !prev.has(lineId)) return prev;
        next.add(lineId);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const keepLineIds = lines.filter((l) => !removedIds.has(l.id)).map((l) => l.id);
    const formData = new FormData();
    formData.set('salesInvoiceId', invoiceId);
    formData.set('keepLineIds', JSON.stringify(keepLineIds));
    formData.set('reason', reason || 'Sale amended');
    formData.set('refundMethod', refundMethod);
    await amendSaleAction(formData);
  };

  return (
    <>
      {/* Line items */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-black/70 mb-4">
          Select items to remove from this sale
        </h3>
        <div className="space-y-2">
          {lines.map((line) => {
            const isRemoved = removedIds.has(line.id);
            const isLastKept = !isRemoved && keptLines.length === 1;
            return (
              <div
                key={line.id}
                className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                  isRemoved
                    ? 'border-rose-300 bg-rose-50'
                    : 'border-black/10 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleRemove(line.id)}
                  disabled={isLastKept}
                  className={`flex-none rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isRemoved
                      ? 'bg-rose-600 text-white hover:bg-rose-700'
                      : isLastKept
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-black/5 text-black/70 hover:bg-rose-100 hover:text-rose-700'
                  }`}
                >
                  {isRemoved ? 'Undo' : 'Remove'}
                </button>
                <div className={`flex-1 min-w-0 ${isRemoved ? 'line-through opacity-50' : ''}`}>
                  <div className="text-sm font-semibold truncate">{line.productName}</div>
                  <div className="text-xs text-black/50">
                    {line.qtyInUnit} × {line.unitName}
                  </div>
                </div>
                <div className={`text-sm font-semibold ${isRemoved ? 'line-through opacity-50' : ''}`}>
                  {formatMoney(line.lineTotalPence, currency)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      {removedIds.size > 0 && (
        <div className="card p-6 space-y-3">
          <h3 className="text-sm font-semibold text-black/70">Amendment Summary</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-black/5 p-3">
              <div className="text-xs text-black/50">Original Total</div>
              <div className="text-sm font-semibold">{formatMoney(totalPence, currency)}</div>
            </div>
            <div className="rounded-xl bg-rose-50 p-3">
              <div className="text-xs text-rose-600">Removed Items</div>
              <div className="text-sm font-semibold text-rose-700">
                −{formatMoney(removedTotal, currency)}
              </div>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3">
              <div className="text-xs text-emerald-600">New Total</div>
              <div className="text-sm font-semibold text-emerald-700">{formatMoney(newTotal, currency)}</div>
            </div>
            {refundAmount > 0 && (
              <div className="rounded-xl bg-accentSoft p-3">
                <div className="text-xs text-accent">Refund Due</div>
                <div className="text-sm font-semibold text-accent">{formatMoney(refundAmount, currency)}</div>
              </div>
            )}
          </div>

          {/* Refund method & reason */}
          <div className="grid gap-4 md:grid-cols-2 pt-2">
            {refundAmount > 0 && (
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
            )}
            <div className={refundAmount > 0 ? '' : 'md:col-span-2'}>
              <label className="label">Reason for Amendment</label>
              <input
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Customer removed items"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              className="btn-primary"
              disabled={!canSubmit}
              onClick={() => setShowConfirm(true)}
            >
              Review & Confirm Amendment
            </button>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold">Confirm Amendment</h3>
                <p className="text-sm text-black/60">This action cannot be undone.</p>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="font-semibold text-black/70">Items to remove:</div>
              {removedLines.map((line) => (
                <div key={line.id} className="flex justify-between rounded-lg bg-rose-50 px-3 py-2">
                  <span className="text-rose-800">
                    {line.qtyInUnit}× {line.productName}
                  </span>
                  <span className="font-semibold text-rose-700">
                    −{formatMoney(line.lineTotalPence, currency)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>New Total</span>
                <span>{formatMoney(newTotal, currency)}</span>
              </div>
              {refundAmount > 0 && (
                <div className="flex justify-between text-accent font-semibold">
                  <span>Refund ({refundMethod})</span>
                  <span>{formatMoney(refundAmount, currency)}</span>
                </div>
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
                className="flex-1 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Processing…' : 'Confirm Amendment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
