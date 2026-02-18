'use client';

import { useState, useTransition } from 'react';
import { formatMoney } from '@/lib/format';
import { openShiftAction, closeShiftAction } from '@/app/actions/shifts';

type Till = { id: string; name: string };

type OpenShift = {
  id: string;
  till: { name: string };
  openedAt: Date;
  openingCashPence: number;
  salesCount: number;
  salesTotal: number;
  expectedCash: number;
  cardTotal: number;
  transferTotal: number;
  momoTotal: number;
  cashByType?: Record<string, number>;
};

type RecentShift = {
  id: string;
  tillName: string;
  userName: string;
  openedAt: string;
  closedAt: string | null;
  status: string;
  salesCount: number;
  openingCashPence: number;
  expectedCashPence: number;
  actualCashPence: number | null;
  variance: number | null;
  cardTotalPence: number;
  transferTotalPence: number;
  momoTotalPence: number;
};

type Props = {
  tills: Till[];
  openShift: OpenShift | null;
  recentShifts: RecentShift[];
  currency: string;
};

export default function ShiftClient({ tills, openShift, recentShifts, currency }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedTill, setSelectedTill] = useState(tills[0]?.id ?? '');
  const [openingCash, setOpeningCash] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [varianceReasonCode, setVarianceReasonCode] = useState('');
  const [varianceReason, setVarianceReason] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);

  const handleOpenShift = () => {
    setError(null);
    const formData = new FormData();
    formData.set('tillId', selectedTill);
    formData.set('openingCash', openingCash);

    startTransition(async () => {
      try {
        await openShiftAction(formData);
        setOpeningCash('');
        window.location.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open shift');
      }
    });
  };

  const handleCloseShift = () => {
    if (!openShift) return;
    setError(null);
    const formData = new FormData();
    formData.set('shiftId', openShift.id);
    formData.set('actualCash', actualCash);
    formData.set('notes', closeNotes);
    formData.set('managerPin', managerPin);
    formData.set('varianceReasonCode', varianceReasonCode);
    formData.set('varianceReason', varianceReason);

    startTransition(async () => {
      try {
        await closeShiftAction(formData);
        setShowCloseModal(false);
        setActualCash('');
        setCloseNotes('');
        setManagerPin('');
        setVarianceReasonCode('');
        setVarianceReason('');
        window.location.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to close shift');
      }
    });
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return 'Active';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  };

  const variancePence = actualCash ? Math.round(Number(actualCash) * 100) - (openShift?.expectedCash ?? 0) : 0;
  const varianceNeedsReason = variancePence !== 0;
  const cashSalesPence = openShift?.cashByType?.CASH_SALE ?? 0;

  return (
    <div className="mt-6 space-y-6">
      {error && (
        <div className="rounded-xl border border-rose/40 bg-rose/10 px-4 py-3 text-sm text-rose">
          {error}
        </div>
      )}

      {openShift ? (
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">
                  Shift Active
                </span>
              </div>
              <h2 className="mt-1 text-xl font-display font-semibold">{openShift.till.name}</h2>
              <div className="text-sm text-black/50">
                Opened {new Date(openShift.openedAt).toLocaleString()}
              </div>
            </div>
            <button
              type="button"
              className="btn-primary bg-rose-600 hover:bg-rose-700"
              onClick={() => setShowCloseModal(true)}
            >
              Close Shift
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-black/10 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-black/40">Sales Count</div>
              <div className="mt-1 text-2xl font-bold">{openShift.salesCount}</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-black/40">Sales Total</div>
              <div className="mt-1 text-2xl font-bold">{formatMoney(openShift.salesTotal, currency)}</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-black/40">Expected Cash</div>
              <div className="mt-1 text-2xl font-bold text-emerald-700">
                {formatMoney(openShift.expectedCash, currency)}
              </div>
              <div className="text-xs text-black/50">
                Opening: {formatMoney(openShift.openingCashPence, currency)}
              </div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-black/40">Card / Transfer</div>
              <div className="mt-1 text-2xl font-bold">
                {formatMoney(openShift.cardTotal + openShift.transferTotal, currency)}
              </div>
            </div>
            {openShift.momoTotal > 0 && (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                <div className="text-xs uppercase tracking-wide text-yellow-700">Mobile Money</div>
                <div className="mt-1 text-2xl font-bold text-yellow-700">
                  {formatMoney(openShift.momoTotal, currency)}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card p-6">
          <h2 className="text-lg font-display font-semibold">Start New Shift</h2>
          <p className="mt-1 text-sm text-black/60">
            Open a shift to track cash and reconcile at the end.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Till</label>
              <select
                className="input"
                value={selectedTill}
                onChange={(e) => setSelectedTill(e.target.value)}
              >
                {tills.map((till) => (
                  <option key={till.id} value={till.id}>
                    {till.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Opening Cash (in drawer)</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className="btn-primary w-full"
                onClick={handleOpenShift}
                disabled={isPending}
              >
                {isPending ? 'Opening...' : 'Open Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Recent Shifts</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="table w-full text-sm">
            <thead>
              <tr>
                <th>Till</th>
                <th>Cashier</th>
                <th>Opened</th>
                <th>Duration</th>
                <th>Sales</th>
                <th>Expected</th>
                <th>Actual</th>
                <th>Variance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentShifts.map((shift) => (
                <tr key={shift.id}>
                  <td className="font-medium">{shift.tillName}</td>
                  <td>{shift.userName}</td>
                  <td>{formatTime(shift.openedAt)}</td>
                  <td>{formatDuration(shift.openedAt, shift.closedAt)}</td>
                  <td>{shift.salesCount}</td>
                  <td>{formatMoney(shift.expectedCashPence, currency)}</td>
                  <td>
                    {shift.actualCashPence !== null
                      ? formatMoney(shift.actualCashPence, currency)
                      : '-'}
                  </td>
                  <td>
                    {shift.variance !== null ? (
                      <span
                        className={
                          shift.variance === 0
                            ? 'text-emerald-700'
                            : shift.variance > 0
                            ? 'text-accent'
                            : 'text-rose-700'
                        }
                      >
                        {shift.variance >= 0 ? '+' : ''}
                        {formatMoney(shift.variance, currency)}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        shift.status === 'OPEN'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {shift.status}
                    </span>
                  </td>
                </tr>
              ))}
              {recentShifts.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-black/50 py-8">
                    No shifts recorded yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Close Shift Modal */}
      {showCloseModal && openShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-display font-semibold">Close Shift</h3>
            <p className="mt-1 text-sm text-black/60">
              Count the cash in your drawer and enter the total below.
            </p>

            <div className="mt-4 rounded-xl border border-black/10 bg-slate-50 p-4">
              <div className="flex justify-between text-sm">
                <span>Opening Cash</span>
                <span className="font-semibold">
                  {formatMoney(openShift.openingCashPence, currency)}
                </span>
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span>Cash Sales</span>
                <span className="font-semibold">
                  + {formatMoney(cashSalesPence, currency)}
                </span>
              </div>
              {openShift.cashByType?.CASH_DEBTOR_PAYMENT ? (
                <div className="mt-2 flex justify-between text-sm">
                  <span>Cash Debtor Payments</span>
                  <span className="font-semibold">
                    + {formatMoney(openShift.cashByType.CASH_DEBTOR_PAYMENT, currency)}
                  </span>
                </div>
              ) : null}
              {openShift.cashByType?.PAID_OUT_EXPENSE ? (
                <div className="mt-2 flex justify-between text-sm">
                  <span>Paid-outs / Expenses</span>
                  <span className="font-semibold">
                    - {formatMoney(Math.abs(openShift.cashByType.PAID_OUT_EXPENSE), currency)}
                  </span>
                </div>
              ) : null}
              {openShift.cashByType?.CASH_REFUND ? (
                <div className="mt-2 flex justify-between text-sm">
                  <span>Cash Refunds</span>
                  <span className="font-semibold">
                    - {formatMoney(Math.abs(openShift.cashByType.CASH_REFUND), currency)}
                  </span>
                </div>
              ) : null}
              <div className="mt-2 flex justify-between border-t border-black/10 pt-2">
                <span className="font-semibold">Expected Cash</span>
                <span className="text-lg font-bold text-emerald-700">
                  {formatMoney(openShift.expectedCash, currency)}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <label className="label">Actual Cash Counted</label>
              <input
                className="input text-lg font-semibold"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                autoFocus
              />
              {actualCash && (
                <div className="mt-2 text-sm">
                  Variance:{' '}
                  <span
                    className={
                      Number(actualCash) * 100 === openShift.expectedCash
                        ? 'text-emerald-700 font-semibold'
                        : Number(actualCash) * 100 > openShift.expectedCash
                        ? 'text-accent font-semibold'
                        : 'text-rose-700 font-semibold'
                    }
                  >
                    {formatMoney(
                      Math.round(Number(actualCash) * 100) - openShift.expectedCash,
                      currency
                    )}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-4">
              <label className="label">Notes (optional)</label>
              <textarea
                className="input"
                rows={2}
                placeholder="Any discrepancies or notes..."
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
              />
            </div>

            <div className="mt-4">
              <label className="label">Variance Reason Code</label>
              <select
                className="input"
                value={varianceReasonCode}
                onChange={(e) => setVarianceReasonCode(e.target.value)}
              >
                <option value="">Select reason</option>
                <option value="COUNT_ERROR">Counting error corrected</option>
                <option value="MISSING_CASH">Missing cash</option>
                <option value="EXTRA_CASH">Extra cash found</option>
                <option value="LATE_POSTING">Late transaction posting</option>
                <option value="OTHER">Other</option>
              </select>
              {varianceNeedsReason && !varianceReasonCode && !varianceReason ? (
                <div className="mt-1 text-xs text-amber-700">
                  Reason code or notes are required for non-zero variance.
                </div>
              ) : null}
            </div>

            <div className="mt-4">
              <label className="label">Variance Details</label>
              <input
                className="input"
                value={varianceReason}
                onChange={(e) => setVarianceReason(e.target.value)}
                placeholder="Describe why counted cash differs"
              />
            </div>

            <div className="mt-4">
              <label className="label">Manager PIN (required)</label>
              <input
                className="input"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={managerPin}
                onChange={(e) => setManagerPin(e.target.value)}
                placeholder="Enter manager approval PIN"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className="btn-ghost flex-1"
                onClick={() => setShowCloseModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary flex-1 bg-rose-600 hover:bg-rose-700"
                onClick={handleCloseShift}
                disabled={
                  isPending ||
                  !actualCash ||
                  !managerPin ||
                  (varianceNeedsReason && !varianceReasonCode && !varianceReason.trim())
                }
              >
                {isPending ? 'Closing...' : 'Close Shift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
