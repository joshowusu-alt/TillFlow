'use client';

import { useRef, useState, useTransition } from 'react';
import { reconcilePaymentAction } from '@/app/actions/reconciliation';
import type { ReconciliationTransaction } from '@/app/actions/reconciliation';
import { formatMoney, getCurrencySymbol } from '@/lib/format';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Reconcile Form — inline form for entering actual amounts
// ---------------------------------------------------------------------------

export function ReconcileForm({
  date,
  method,
  storeId,
  systemTotalPence,
  currency,
}: {
  date: string;
  method: string;
  storeId: string;
  systemTotalPence: number;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button
        className="btn-secondary text-xs"
        onClick={() => setOpen(true)}
      >
        Reconcile
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(formData) => {
        startTransition(async () => {
          await reconcilePaymentAction(formData);
          setOpen(false);
        });
      }}
      className="space-y-2"
    >
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="paymentMethod" value={method} />
      <input type="hidden" name="storeId" value={storeId} />
      <div>
        <label className="label text-xs">
          Actual Total ({getCurrencySymbol(currency)})
        </label>
        <input
          className="input text-sm"
          type="number"
          name="actualTotal"
          step="0.01"
          min="0"
          placeholder={(systemTotalPence / 100).toFixed(2)}
          required
          autoFocus
        />
      </div>
      <div>
        <label className="label text-xs">Notes (optional)</label>
        <input
          className="input text-sm"
          type="text"
          name="notes"
          placeholder="e.g. bank statement ref"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="btn-primary text-xs"
          disabled={pending}
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Transaction Drill-Down — shows individual payments for a date/method
// ---------------------------------------------------------------------------

export function TransactionDrillDown({
  transactions,
  currency,
}: {
  transactions: ReconciliationTransaction[];
  currency: string;
}) {
  if (transactions.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-black/50">
        No transactions for this date and method.
      </p>
    );
  }

  return (
    <table className="table w-full border-separate border-spacing-y-1">
      <thead>
        <tr>
          <th>Time</th>
          <th>Invoice</th>
          <th>Customer</th>
          <th>Amount</th>
          <th>Reference</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((tx) => (
          <tr key={tx.id} className="rounded-xl bg-white align-top">
            <td className="px-3 py-2 text-xs">
              {new Date(tx.receivedAt).toLocaleTimeString('en-GH', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </td>
            <td className="px-3 py-2 text-xs">
              <Link
                className="text-emerald-700 hover:underline"
                href={`/receipts/${tx.salesInvoiceId}`}
              >
                {tx.salesInvoiceId.slice(0, 8)}
              </Link>
            </td>
            <td className="px-3 py-2 text-xs">
              {tx.customerName ?? <span className="text-black/40">Walk-in</span>}
            </td>
            <td className="px-3 py-2 text-sm font-semibold">
              {formatMoney(tx.amountPence, currency)}
            </td>
            <td className="px-3 py-2 text-xs font-mono">
              {tx.reference ?? <span className="text-black/40">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
