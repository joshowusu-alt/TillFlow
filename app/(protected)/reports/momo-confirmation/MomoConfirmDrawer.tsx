'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ResponsiveModal from '@/components/ResponsiveModal';
import ReportTableCard, { ReportTableEmptyRow } from '@/components/reports/ReportTableCard';
import { useToast } from '@/components/ToastProvider';
import { formatMoney } from '@/lib/format';
import { confirmMomoPaymentAction } from '@/app/actions/momo-confirmation';

export type MomoConfirmRowView = {
  paymentId: string;
  receivedAtIso: string;
  amountPence: number;
  method: string;
  status: string;
  receiptOrigin: string | null;
  reference: string | null;
  network: string | null;
  provider: string | null;
  payerMsisdn: string | null;
  collectionId: string | null;
  salesInvoiceId: string;
  transactionNumber: string | null;
  saleStatus: string;
  storeName: string;
  cashierName: string | null;
  customerName: string | null;
};

function formatWhen(iso: string, timeZone: string) {
  return new Date(iso).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  });
}

function parentBlocksConfirm(saleStatus: string) {
  return saleStatus === 'RETURNED' || saleStatus === 'VOID';
}

export default function MomoConfirmDrawer({
  rows,
  currency,
  timeZone,
  queryFailed,
}: {
  rows: MomoConfirmRowView[];
  currency: string;
  timeZone: string;
  queryFailed: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selected = rows.find((row) => row.paymentId === openId) ?? null;
  const blocked = selected ? parentBlocksConfirm(selected.saleStatus) : false;

  function openRow(row: MomoConfirmRowView) {
    setOpenId(row.paymentId);
    setReference(row.reference?.trim() || '');
    setNote('');
    setFormError(null);
  }

  function closeDrawer() {
    if (submitting) return;
    setOpenId(null);
    setFormError(null);
  }

  async function onConfirm() {
    if (!selected || blocked) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await confirmMomoPaymentAction({
        paymentId: selected.paymentId,
        reference,
        note,
      });
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      toast(
        result.data.alreadyConfirmed
          ? 'This payment was already confirmed.'
          : 'MoMo payment confirmed. It now counts in Money Received for the original payment date.',
        'success',
      );
      setOpenId(null);
      router.refresh();
    } catch {
      setFormError('Could not confirm this payment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <ReportTableCard title="Needs MoMo confirmation">
        <thead>
          <tr>
            <th>When</th>
            <th>Branch</th>
            <th>Cashier</th>
            <th>Sale</th>
            <th>Customer</th>
            <th>Method</th>
            <th>Status</th>
            <th>Sale status</th>
            <th className="text-right">Amount</th>
            <th className="text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <ReportTableEmptyRow
              colSpan={10}
              message={
                queryFailed
                  ? 'No rows — query failed.'
                  : 'No payments need MoMo confirmation in this scope.'
              }
            />
          ) : (
            rows.map((row) => (
              <tr key={row.paymentId} data-testid={`momo-confirm-row-${row.paymentId}`}>
                <td>{formatWhen(row.receivedAtIso, timeZone)}</td>
                <td>{row.storeName}</td>
                <td>{row.cashierName ?? '—'}</td>
                <td>
                  <a
                    href={`/receipts/${row.salesInvoiceId}`}
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    {row.transactionNumber ?? 'Sale'}
                  </a>
                </td>
                <td>{row.customerName ?? '—'}</td>
                <td>{row.method === 'MOBILE_MONEY' ? 'Mobile Money' : row.method}</td>
                <td>
                  <span className="font-medium text-amber-900">{row.status}</span>
                </td>
                <td>{row.saleStatus}</td>
                <td className="text-right tabular-nums">{formatMoney(row.amountPence, currency)}</td>
                <td className="text-right">
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1 text-sm"
                    onClick={() => openRow(row)}
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </ReportTableCard>

      <ResponsiveModal
        open={Boolean(selected)}
        onClose={closeDrawer}
        ariaLabel="Review MoMo payment"
        maxWidthClassName="max-w-lg"
        footer={
          selected ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={closeDrawer} disabled={submitting}>
                Close
              </button>
              {!blocked ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onConfirm}
                  disabled={submitting}
                  data-testid="confirm-momo-payment"
                >
                  {submitting ? 'Confirming…' : 'Confirm MoMo payment'}
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-4 p-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Review MoMo payment</h2>
              <p className="mt-1 text-sm text-slate-600">
                This confirms money that was already recorded at checkout. It is not a new receipt.
                After confirmation it appears in Money Received using the original payment date
                ({formatWhen(selected.receivedAtIso, timeZone)}), not today.
              </p>
            </div>

            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Invoice</dt>
                <dd className="font-medium">{selected.transactionNumber ?? selected.salesInvoiceId}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Amount</dt>
                <dd className="font-medium tabular-nums">{formatMoney(selected.amountPence, currency)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Branch</dt>
                <dd className="font-medium">{selected.storeName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Cashier</dt>
                <dd className="font-medium">{selected.cashierName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Received</dt>
                <dd className="font-medium">{formatWhen(selected.receivedAtIso, timeZone)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Current status</dt>
                <dd className="font-medium text-amber-900">{selected.status}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Sale status</dt>
                <dd className="font-medium">{selected.saleStatus}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Customer</dt>
                <dd className="font-medium">{selected.customerName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Existing reference</dt>
                <dd className="font-medium">{selected.reference || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Network / provider</dt>
                <dd className="font-medium">
                  {[selected.network, selected.provider].filter(Boolean).join(' · ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Payer number</dt>
                <dd className="font-medium">{selected.payerMsisdn || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Collection</dt>
                <dd className="font-medium">{selected.collectionId || 'None'}</dd>
              </div>
            </dl>

            {blocked ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                This sale was {selected.saleStatus.toLowerCase()}. Review only — do not confirm.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Confirm only after you have checked the customer receipt or MoMo statement. The
                  original received time stays the same.
                </div>
                <div>
                  <label className="label" htmlFor="momo-confirm-reference">
                    Provider / statement reference
                  </label>
                  <input
                    id="momo-confirm-reference"
                    className="input"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="MoMo txn id or statement line"
                    autoComplete="off"
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="momo-confirm-note">
                    Confirmation note
                  </label>
                  <textarea
                    id="momo-confirm-note"
                    className="input min-h-[88px]"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="How you confirmed this money arrived"
                    required
                  />
                </div>
                {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
              </div>
            )}
          </div>
        ) : null}
      </ResponsiveModal>
    </>
  );
}
