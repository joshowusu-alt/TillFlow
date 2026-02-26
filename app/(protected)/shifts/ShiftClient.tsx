'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '@/lib/format';
import { openShiftAction, closeShiftAction, closeShiftOwnerOverrideAction } from '@/app/actions/shifts';

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

type OtherOpenShift = {
  id: string;
  till: { name: string };
  userName: string;
  openedAt: string;
  openingCashPence: number;
  salesCount: number;
  salesTotal: number;
  expectedCash: number;
  cardTotal: number;
  transferTotal: number;
  momoTotal: number;
  cashByType?: Record<string, number>;
};

type Props = {
  tills: Till[];
  openShift: OpenShift | null;
  otherOpenShifts?: OtherOpenShift[];
  recentShifts: RecentShift[];
  currency: string;
  userRole?: string;
};

export default function ShiftClient({ tills, openShift, otherOpenShifts = [], recentShifts, currency, userRole }: Props) {
  const router = useRouter();
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
  const [selectedOtherShift, setSelectedOtherShift] = useState<OtherOpenShift | null>(null);
  const [showOwnerOverride, setShowOwnerOverride] = useState(false);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [overrideReasonCode, setOverrideReasonCode] = useState('');
  const [overrideJustification, setOverrideJustification] = useState('');
  const isOwner = userRole === 'OWNER';

  // Lock background scroll when close-shift modal is open
  useEffect(() => {
    if (showCloseModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showCloseModal]);

  type ClosedSummary = {
    tillName: string;
    salesCount: number;
    cashSalesPence: number;
    floatRetainedPence: number;
    handoverPence: number;
    actualCashPence: number;
    variancePence: number;
  };
  const [closedSummary, setClosedSummary] = useState<ClosedSummary | null>(null);

  const handleOpenShift = () => {
    setError(null);
    const formData = new FormData();
    formData.set('tillId', selectedTill);
    formData.set('openingCash', openingCash);

    startTransition(async () => {
      try {
        await openShiftAction(formData);
        setOpeningCash('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open shift');
      }
    });
  };

  const handleCloseShift = () => {
    if (!shiftToClose) return;
    setError(null);
    const formData = new FormData();
    formData.set('shiftId', shiftToClose.id);
    formData.set('actualCash', actualCash);
    formData.set('notes', closeNotes);
    formData.set('varianceReasonCode', varianceReasonCode);
    formData.set('varianceReason', varianceReason);

    // Capture summary before data disappears on refresh
    const summarySnapshot: ClosedSummary = {
      tillName: shiftToClose.till.name,
      salesCount: shiftToClose.salesCount,
      cashSalesPence: shiftToClose.cashByType?.CASH_SALE ?? 0,
      floatRetainedPence: shiftToClose.openingCashPence,
      handoverPence: Math.max(0, shiftToClose.expectedCash - shiftToClose.openingCashPence),
      actualCashPence: Math.round(Number(actualCash) * 100),
      variancePence: Math.round(Number(actualCash) * 100) - shiftToClose.expectedCash,
    };

    if (showOwnerOverride) {
      formData.set('ownerPassword', ownerPassword);
      formData.set('overrideReasonCode', overrideReasonCode);
      formData.set('overrideJustification', overrideJustification);
    } else {
      formData.set('managerPin', managerPin);
    }

    startTransition(async () => {
      try {
        if (showOwnerOverride) {
          await closeShiftOwnerOverrideAction(formData);
        } else {
          await closeShiftAction(formData);
        }
        setShowCloseModal(false);
        setSelectedOtherShift(null);
        setActualCash('');
        setCloseNotes('');
        setManagerPin('');
        setVarianceReasonCode('');
        setVarianceReason('');
        setOwnerPassword('');
        setOverrideReasonCode('');
        setOverrideJustification('');
        setShowOwnerOverride(false);
        setClosedSummary(summarySnapshot);
        router.refresh();
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

  // The shift we're closing — either user's own or an owner-selected other shift
  const shiftToClose = selectedOtherShift
    ? {
        id: selectedOtherShift.id,
        till: selectedOtherShift.till,
        openedAt: new Date(selectedOtherShift.openedAt),
        openingCashPence: selectedOtherShift.openingCashPence,
        salesCount: selectedOtherShift.salesCount,
        salesTotal: selectedOtherShift.salesTotal,
        expectedCash: selectedOtherShift.expectedCash,
        cardTotal: selectedOtherShift.cardTotal,
        transferTotal: selectedOtherShift.transferTotal,
        momoTotal: selectedOtherShift.momoTotal,
        cashByType: selectedOtherShift.cashByType,
      }
    : openShift;

  const variancePence = actualCash ? Math.round(Number(actualCash) * 100) - (shiftToClose?.expectedCash ?? 0) : 0;
  const varianceNeedsReason = variancePence !== 0;
  const cashSalesPence = shiftToClose?.cashByType?.CASH_SALE ?? 0;

  // Same-day warning: check if the shift was opened on a different calendar day
  const isStaleShift = shiftToClose
    ? new Date(shiftToClose.openedAt).toDateString() !== new Date().toDateString()
    : false;
  const staleShiftDays = shiftToClose
    ? Math.floor((Date.now() - new Date(shiftToClose.openedAt).getTime()) / 86_400_000)
    : 0;

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
        <>
        {closedSummary && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">✓</span>
                <div>
                  <div className="font-semibold text-emerald-800">Shift Closed — {closedSummary.tillName}</div>
                  <div className="text-xs text-emerald-600">{closedSummary.salesCount} transaction{closedSummary.salesCount !== 1 ? 's' : ''} during shift</div>
                </div>
              </div>
              <button type="button" className="text-emerald-400 hover:text-emerald-600 text-xs" onClick={() => setClosedSummary(null)}>Dismiss</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-white p-3 border border-emerald-100">
                <div className="text-[10px] uppercase tracking-wider text-black/40">Cash Sales</div>
                <div className="font-bold text-lg">{formatMoney(closedSummary.cashSalesPence, currency)}</div>
              </div>
              <div className="rounded-xl bg-white p-3 border border-blue-100">
                <div className="text-[10px] uppercase tracking-wider text-blue-400">Handover to Safe</div>
                <div className="font-bold text-lg text-blue-700">{formatMoney(closedSummary.handoverPence, currency)}</div>
                <div className="text-[10px] text-black/40">Float retained: {formatMoney(closedSummary.floatRetainedPence, currency)}</div>
              </div>
              <div className="rounded-xl bg-white p-3 border border-black/10">
                <div className="text-[10px] uppercase tracking-wider text-black/40">Variance</div>
                <div className={`font-bold text-lg ${
                  closedSummary.variancePence === 0 ? 'text-emerald-700' :
                  closedSummary.variancePence > 0 ? 'text-accent' : 'text-rose-600'
                }`}>
                  {closedSummary.variancePence >= 0 ? '+' : ''}{formatMoney(closedSummary.variancePence, currency)}
                </div>
                <div className="text-[10px] text-black/40">Counted: {formatMoney(closedSummary.actualCashPence, currency)}</div>
              </div>
            </div>
          </div>
        )}
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
        </>
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

      {/* Owner: other open shifts they can close */}
      {isOwner && otherOpenShifts.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-display font-semibold">Other Open Shifts</h2>
          <p className="mt-1 text-sm text-black/60">
            Shifts opened by other cashiers that you can close as owner.
          </p>
          <div className="mt-4 space-y-3">
            {otherOpenShifts.map((s) => {
              const openedDate = new Date(s.openedAt);
              const isStale = openedDate.toDateString() !== new Date().toDateString();
              return (
                <div
                  key={s.id}
                  className={`flex items-center justify-between rounded-xl border p-4 ${
                    isStale ? 'border-amber-200 bg-amber-50' : 'border-black/10 bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-semibold">{s.till.name}</span>
                      <span className="text-xs text-black/40">by {s.userName}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-black/50">
                      Opened {openedDate.toLocaleString()}
                      {isStale && (
                        <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          {Math.floor((Date.now() - openedDate.getTime()) / 86_400_000)}d overdue
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-black/50">
                      {s.salesCount} sale{s.salesCount !== 1 ? 's' : ''} &middot; Expected: {formatMoney(s.expectedCash, currency)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary bg-rose-600 hover:bg-rose-700 text-sm"
                    onClick={() => {
                      setSelectedOtherShift(s);
                      setShowCloseModal(true);
                      setShowOwnerOverride(true);
                    }}
                  >
                    Close
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Close Shift Modal */}
      {showCloseModal && shiftToClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl my-auto">
            <h3 className="text-lg font-display font-semibold">
              Close Shift{selectedOtherShift ? ` — ${selectedOtherShift.userName}` : ''}
            </h3>
            <p className="mt-1 text-sm text-black/60">
              Count the cash in your drawer and enter the total below.
            </p>

            {/* Stale shift warning */}
            {isStaleShift && (
              <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 text-lg leading-none">!</span>
                  <div>
                    <div className="text-sm font-semibold text-amber-800">
                      Shift opened {staleShiftDays} day{staleShiftDays !== 1 ? 's' : ''} ago
                    </div>
                    <div className="mt-0.5 text-xs text-amber-700">
                      This shift was opened on {new Date(shiftToClose.openedAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} and should have been closed the same day. Cash reconciliation may be inaccurate.
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-black/10 bg-slate-50 p-4">
              <div className="flex justify-between text-sm">
                <span>Opening Cash</span>
                <span className="font-semibold">
                  {formatMoney(shiftToClose.openingCashPence, currency)}
                </span>
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span>Cash Sales</span>
                <span className="font-semibold">
                  + {formatMoney(cashSalesPence, currency)}
                </span>
              </div>
              {shiftToClose.cashByType?.CASH_DEBTOR_PAYMENT ? (
                <div className="mt-2 flex justify-between text-sm">
                  <span>Cash Debtor Payments</span>
                  <span className="font-semibold">
                    + {formatMoney(shiftToClose.cashByType.CASH_DEBTOR_PAYMENT, currency)}
                  </span>
                </div>
              ) : null}
              {shiftToClose.cashByType?.PAID_OUT_EXPENSE ? (
                <div className="mt-2 flex justify-between text-sm">
                  <span>Paid-outs / Expenses</span>
                  <span className="font-semibold">
                    - {formatMoney(Math.abs(shiftToClose.cashByType.PAID_OUT_EXPENSE), currency)}
                  </span>
                </div>
              ) : null}
              {shiftToClose.cashByType?.CASH_REFUND ? (
                <div className="mt-2 flex justify-between text-sm">
                  <span>Cash Refunds</span>
                  <span className="font-semibold">
                    - {formatMoney(Math.abs(shiftToClose.cashByType.CASH_REFUND), currency)}
                  </span>
                </div>
              ) : null}
              <div className="mt-2 flex justify-between border-t border-black/10 pt-2">
                <span className="font-semibold">Expected Cash</span>
                <span className="text-lg font-bold text-emerald-700">
                  {formatMoney(shiftToClose.expectedCash, currency)}
                </span>
              </div>
            </div>

            {/* Handover summary — float stays in drawer for the next shift */}
            {shiftToClose.openingCashPence > 0 && (
              <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-1.5">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-blue-500">Cash Handover</p>
                <div className="flex justify-between text-sm text-black/60">
                  <span>Retain in drawer (opening float)</span>
                  <span className="font-semibold">&minus;&nbsp;{formatMoney(shiftToClose.openingCashPence, currency)}</span>
                </div>
                <div className="flex justify-between border-t border-blue-200 pt-1.5 text-sm font-bold text-blue-700">
                  <span>Hand to safe / manager ↑</span>
                  <span>{formatMoney(Math.max(0, shiftToClose.expectedCash - shiftToClose.openingCashPence), currency)}</span>
                </div>
              </div>
            )}

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
                      Number(actualCash) * 100 === shiftToClose.expectedCash
                        ? 'text-emerald-700 font-semibold'
                        : Number(actualCash) * 100 > shiftToClose.expectedCash
                        ? 'text-accent font-semibold'
                        : 'text-rose-700 font-semibold'
                    }
                  >
                    {formatMoney(
                      Math.round(Number(actualCash) * 100) - shiftToClose.expectedCash,
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

            {!showOwnerOverride ? (
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
            ) : (
              <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">Owner Override</div>
                <div>
                  <label className="label">Your Password</label>
                  <input
                    className="input"
                    type="password"
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    placeholder="Re-enter your login password"
                  />
                </div>
                <div>
                  <label className="label">Reason Code</label>
                  <select
                    className="input"
                    value={overrideReasonCode}
                    onChange={(e) => setOverrideReasonCode(e.target.value)}
                  >
                    <option value="">Select reason...</option>
                    <option value="MANAGER_UNAVAILABLE">Manager unavailable</option>
                    <option value="EMERGENCY_CLOSE">Emergency close</option>
                    <option value="SYSTEM_ISSUE">System/PIN issue</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="label">Justification</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={overrideJustification}
                    onChange={(e) => setOverrideJustification(e.target.value)}
                    placeholder="Explain why owner override is needed"
                  />
                </div>
              </div>
            )}

            {isOwner && !selectedOtherShift ? (
              <div className="mt-3 text-center">
                <button
                  type="button"
                  className="text-xs text-black/50 underline hover:text-black/80"
                  onClick={() => {
                    setShowOwnerOverride(!showOwnerOverride);
                    setManagerPin('');
                    setOwnerPassword('');
                    setOverrideReasonCode('');
                    setOverrideJustification('');
                  }}
                >
                  {showOwnerOverride ? 'Use Manager PIN instead' : 'Owner Override (no PIN)'}
                </button>
              </div>
            ) : null}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className="btn-ghost flex-1"
                onClick={() => { setShowCloseModal(false); setSelectedOtherShift(null); }}
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
                  (!showOwnerOverride && !managerPin) ||
                  (showOwnerOverride && (!ownerPassword || !overrideReasonCode || !overrideJustification.trim())) ||
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
