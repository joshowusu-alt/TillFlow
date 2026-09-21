'use client';

import { useMemo, useState } from 'react';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import StableIdempotencyKeyInput from '@/components/StableIdempotencyKeyInput';
import RemainingBalance from '@/components/RemainingBalance';
import { createExpenseAction } from '@/app/actions/expenses';
import {
  INVENTORY_LOSS_ACCOUNT_CODE,
  defaultExpenseAccountId,
  expensePaymentState,
  remainingBalancePence,
} from '@/lib/reliability/walkthrough-contracts';

type ExpenseAccount = { id: string; code: string; name: string };
type OpenShift = { tillId: string; tillName: string };

function parsePence(raw: string): number {
  const trimmed = raw.replace(/,/g, '').trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

export default function ExpenseForm({
  businessId,
  currency,
  accounts,
  openShifts,
  detailedCategories,
  error,
  recorded,
  sourceAdjustmentId,
  storeId,
  actorRole,
}: {
  businessId: string;
  currency: string;
  accounts: ExpenseAccount[];
  openShifts: OpenShift[];
  detailedCategories: boolean;
  error?: string;
  recorded?: boolean;
  sourceAdjustmentId?: string;
  storeId: string;
  actorRole: string;
}) {
  const [amount, setAmount] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'PART_PAID' | 'UNPAID'>('PAID');
  const [amountPaid, setAmountPaid] = useState('');
  const [method, setMethod] = useState('CASH');
  // Default to the ordinary operating-expenses account. Inventory loss (5100)
  // is posted automatically from stock adjustments and must be chosen on
  // purpose, never land as the pre-selected category.
  const [accountId, setAccountId] = useState(() => defaultExpenseAccountId(accounts));
  const [inventoryLossOverride, setInventoryLossOverride] = useState(false);

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const isInventoryLoss = selectedAccount?.code === INVENTORY_LOSS_ACCOUNT_CODE;
  const amountPence = parsePence(amount);
  const paidPence =
    paymentStatus === 'UNPAID'
      ? 0
      : paymentStatus === 'PAID'
        ? amountPence
        : parsePence(amountPaid);
  const derivedStatus = expensePaymentState(amountPence, paidPence);
  const remaining = remainingBalancePence(amountPence, paidPence);
  const showPaymentDetails = paymentStatus !== 'UNPAID';
  const showPaidField = paymentStatus === 'PART_PAID';
  const showTill = showPaymentDetails && method === 'CASH';

  const statusHint = useMemo(() => {
    if (paymentStatus === 'UNPAID') return 'Nothing is paid yet. Remaining equals the full amount.';
    if (paymentStatus === 'PAID') return 'Paid in full. The paid amount is the expense total.';
    return 'Enter the amount paid so far. Remaining is calculated for you.';
  }, [paymentStatus]);

  return (
    <form action={createExpenseAction} className="grid gap-4 md:grid-cols-4" encType="multipart/form-data">
      <StableIdempotencyKeyInput scope={`expense-create:${businessId}`} rotate={recorded} />
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="useSimple" value={detailedCategories ? 'false' : 'true'} />
      {sourceAdjustmentId ? <input type="hidden" name="sourceAdjustmentId" value={sourceAdjustmentId} /> : null}
      <div className="md:col-span-4">
        <FormError error={error} />
      </div>

      <div className="md:col-span-4 rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
        Inventory loss from stock adjustments is posted automatically. Do not record it again on
        account {INVENTORY_LOSS_ACCOUNT_CODE} unless authorised.
      </div>

      <div className="md:col-span-4 border-t border-black/8 pt-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-black/40">
          Amount and category
        </div>
      </div>
      {detailedCategories ? (
        <div>
          <label className="label">Category</label>
          <select
            className="input"
            name="accountId"
            required
            value={accountId}
            onChange={(event) => {
              setAccountId(event.target.value);
              setInventoryLossOverride(false);
            }}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} — {account.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="md:col-span-2">
          <label className="label">Category</label>
          <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold">
            Operating Expenses
          </div>
          <div className="mt-1 text-xs text-black/50">
            Starter keeps one expense bucket. Growth and Pro unlock full expense categories.
          </div>
        </div>
      )}
      <div>
        <label className="label">Amount</label>
        <input
          className="input"
          name="amount"
          placeholder="0.00"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>
      {amountPence > 0 ? (
        <div className="md:col-span-4">
          <RemainingBalance amountPence={amountPence} paidPence={paidPence} currency={currency} />
          {derivedStatus !== paymentStatus && amountPence > 0 && paymentStatus === 'PART_PAID' ? (
            <p className="mt-1 text-xs text-amber-700">
              Paid amount must be greater than 0 and less than the expense total.
            </p>
          ) : null}
        </div>
      ) : null}

      {isInventoryLoss ? (
        <div className="md:col-span-4 space-y-2 rounded-xl border border-amber-200 bg-white px-3 py-3">
          {actorRole === 'OWNER' ? (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="inventoryLossOverride"
              value="on"
              checked={inventoryLossOverride}
              onChange={(event) => setInventoryLossOverride(event.target.checked)}
              className="mt-1"
            />
            <span>
              Owner override — this creates a second accounting effect on top of the original
              stock adjustment (Dr 5100 / Cr cash or payable). Use only when that second posting
              is intentional.
            </span>
          </label>
          ) : (
            <p className="text-sm text-amber-900">
              Inventory-loss override is owner-only and server-enforced. Managers cannot post a
              second 5100 expense against a stock adjustment.
            </p>
          )}
          {inventoryLossOverride ? (
            <div>
              <label className="label">Override reason</label>
              <input
                className="input"
                name="inventoryLossOverrideReason"
                required
                placeholder="Why this 5100 expense is authorised"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="md:col-span-4 border-t border-black/8 pt-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-black/40">
          Payment status
        </div>
      </div>
      <div>
        <label className="label">Payment status</label>
        <select
          className="input"
          name="paymentStatus"
          value={paymentStatus}
          onChange={(event) => setPaymentStatus(event.target.value as typeof paymentStatus)}
        >
          <option value="PAID">Paid</option>
          <option value="PART_PAID">Part paid</option>
          <option value="UNPAID">Unpaid</option>
        </select>
        <div className="mt-1 text-xs text-black/50">{statusHint}</div>
      </div>
      {paymentStatus === 'UNPAID' ? (
        <div className="md:col-span-3 self-end text-sm text-black/55">
          Remaining {remaining === amountPence ? 'equals the full amount' : 'is calculated from amounts paid'}.
          Payment method and till are hidden until money is paid.
        </div>
      ) : paymentStatus === 'PAID' ? (
        <div className="md:col-span-3 self-end text-sm text-black/55">
          Remaining is 0. Paid amount is the expense total.
        </div>
      ) : null}

      {showPaymentDetails ? (
        <>
          <div className="md:col-span-4 border-t border-black/8 pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-black/40">
              Payment details
            </div>
          </div>
          {showPaidField ? (
            <div>
              <label className="label">Paid amount</label>
              <input
                className="input"
                name="amountPaid"
                placeholder="0.00"
                required
                value={amountPaid}
                onChange={(event) => setAmountPaid(event.target.value)}
              />
              <div className="mt-1 text-xs text-black/50">
                Must be more than 0 and less than the expense total. Overpayment is not allowed.
              </div>
            </div>
          ) : null}
          <div>
            <label className="label">Payment method</label>
            <select
              className="input"
              name="method"
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="TRANSFER">Transfer</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
            </select>
          </div>
          {showTill ? (
            <div>
              <label className="label">Till (cash from this drawer)</label>
              <select
                className="input"
                name="tillId"
                required={openShifts.length > 0}
                defaultValue={openShifts.length === 1 ? openShifts[0].tillId : ''}
              >
                {openShifts.length === 0 ? (
                  <option value="">No open till — open a till for cash</option>
                ) : (
                  <>
                    {openShifts.length > 1 ? <option value="">Select till…</option> : null}
                    {openShifts.map((shift) => (
                      <option key={shift.tillId} value={shift.tillId}>
                        {shift.tillName}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="md:col-span-4 border-t border-black/8 pt-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-black/40">
          Optional supporting details
        </div>
      </div>
      {!sourceAdjustmentId ? (
        <div>
          <label className="label">Linked stock adjustment (optional)</label>
          <input className="input" name="sourceAdjustmentId" placeholder="Adjustment id" />
        </div>
      ) : (
        <div className="md:col-span-2 text-xs text-black/55 self-end">
          Linked to stock adjustment {sourceAdjustmentId}.
        </div>
      )}
      <div>
        <label className="label">Vendor / Payee</label>
        <input className="input" name="vendorName" placeholder="Supplier or payee" />
      </div>
      <div>
        <label className="label">Due Date</label>
        <input className="input" name="dueDate" type="date" />
      </div>
      <div>
        <label className="label">Reference</label>
        <input className="input" name="reference" placeholder="Invoice / receipt ref" />
      </div>
      <div>
        <label className="label">Attachment</label>
        <input className="input" name="attachment" type="file" accept="image/*,.pdf" />
      </div>
      <div className="md:col-span-4">
        <label className="label">Notes</label>
        <input className="input" name="notes" placeholder="Optional notes" />
      </div>
      <div className="md:col-span-4">
        <SubmitButton className="btn-primary" loadingText="Recording…">
          Record expense
        </SubmitButton>
      </div>
    </form>
  );
}
