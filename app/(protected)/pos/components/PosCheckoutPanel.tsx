'use client';

import { formatMoney } from '@/lib/format';
import {
  POS_QUICK_CASH_DENOMINATIONS_GHS,
  nonCashConfirmInstruction,
  paymentMethodLabel,
  type DueDateDecision,
  type PosPaymentStatus,
} from '@/lib/payments/pos-checkout-state';
import type { PosPaymentMethod } from '@/lib/payments/pos-checkout';
import type { CollectionNetwork } from '@/hooks/usePosMomoPayment';
import type { RefObject } from 'react';

type PosCheckoutPanelProps = {
  currency: string;
  paymentStatus: PosPaymentStatus;
  onPaymentStatusChange: (status: PosPaymentStatus) => void;
  availablePaymentMethods: PosPaymentMethod[];
  paymentMethods: PosPaymentMethod[];
  onTogglePaymentMethod: (method: PosPaymentMethod) => void;
  showSplitPanel: boolean;
  onToggleSplitPanel: () => void;
  cashTendered: string;
  onCashTenderedChange: (value: string) => void;
  cashRef: RefObject<HTMLInputElement>;
  cardPaid: string;
  onCardPaidChange: (value: string) => void;
  transferPaid: string;
  onTransferPaidChange: (value: string) => void;
  momoPaid: string;
  onMomoPaidChange: (value: string) => void;
  cardRefValue: string;
  onCardRefChange: (value: string) => void;
  transferRefValue: string;
  onTransferRefChange: (value: string) => void;
  momoRef: string;
  onMomoRefChange: (value: string) => void;
  momoNetwork: CollectionNetwork;
  onMomoNetworkChange: (value: CollectionNetwork) => void;
  momoPayerMsisdn: string;
  onMomoPayerMsisdnChange: (value: string) => void;
  momoGuidance: string;
  totalDue: number;
  totalPaid: number;
  balanceRemaining: number;
  changeDue: number;
  dueDateDecision: DueDateDecision;
  dueDate: string;
  onDueDateDecisionChange: (decision: DueDateDecision) => void;
  onDueDateChange: (value: string) => void;
  showAmountInputs: boolean;
};

export default function PosCheckoutPanel({
  currency,
  paymentStatus,
  onPaymentStatusChange,
  availablePaymentMethods,
  paymentMethods,
  onTogglePaymentMethod,
  showSplitPanel,
  onToggleSplitPanel,
  cashTendered,
  onCashTenderedChange,
  cashRef,
  cardPaid,
  onCardPaidChange,
  transferPaid,
  onTransferPaidChange,
  momoPaid,
  onMomoPaidChange,
  cardRefValue,
  onCardRefChange,
  transferRefValue,
  onTransferRefChange,
  momoRef,
  onMomoRefChange,
  momoNetwork,
  onMomoNetworkChange,
  momoPayerMsisdn,
  onMomoPayerMsisdnChange,
  momoGuidance,
  totalDue,
  totalPaid,
  balanceRemaining,
  changeDue,
  dueDateDecision,
  dueDate,
  onDueDateDecisionChange,
  onDueDateChange,
  showAmountInputs,
}: PosCheckoutPanelProps) {
  const hasMethod = (method: PosPaymentMethod) => paymentMethods.includes(method);
  const isUnpaid = paymentStatus === 'UNPAID';
  const isPartPaid = paymentStatus === 'PART_PAID';
  const isCreditLike = isUnpaid || isPartPaid;
  const isSplit = paymentMethods.length > 1;
  const showMethods = !isUnpaid;
  const showCashControls = showMethods && hasMethod('CASH');
  const showCard = showMethods && hasMethod('CARD') && (isSplit || showAmountInputs);
  const showTransfer = showMethods && hasMethod('TRANSFER') && (isSplit || showAmountInputs);
  const showMomo = showMethods && hasMethod('MOBILE_MONEY');

  return (
    <div id="pos-payment-panel" tabIndex={-1} className="space-y-3 rounded-2xl border border-black/10 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[9rem] flex-1">
          <label className="label" htmlFor="pos-payment-status">Payment status</label>
          <select
            id="pos-payment-status"
            className="input"
            name="paymentStatus"
            value={paymentStatus}
            onChange={(e) => onPaymentStatusChange(e.target.value as PosPaymentStatus)}
          >
            <option value="PAID">Paid</option>
            <option value="PART_PAID">Part Paid</option>
            <option value="UNPAID">Unpaid (Credit)</option>
          </select>
        </div>

        {showMethods ? (
          <div className="flex-[2]">
            <div className="label">Method</div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {availablePaymentMethods.map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => onTogglePaymentMethod(method)}
                  aria-pressed={hasMethod(method)}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    hasMethod(method)
                      ? method === 'MOBILE_MONEY'
                        ? 'bg-yellow-500 text-white'
                        : 'bg-accent text-white'
                      : 'bg-black/5 text-black/50 hover:bg-black/10'
                  }`}
                >
                  {paymentMethodLabel(method)}
                </button>
              ))}
              <button
                type="button"
                onClick={onToggleSplitPanel}
                aria-pressed={isSplit || showSplitPanel}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  isSplit || showSplitPanel
                    ? 'bg-slate-800 text-white'
                    : 'bg-black/5 text-black/50 hover:bg-black/10'
                }`}
              >
                Split…
              </button>
            </div>
            {isSplit || showSplitPanel ? (
              <div className="mt-2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-700">
                Split payment — select every method that will be used, then enter each amount.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex-[2] rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
            Credit sale — no payment is recorded at checkout.
          </div>
        )}
      </div>

      {isCreditLike ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
          <div className="label">Due date</div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onDueDateDecisionChange('date')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                dueDateDecision === 'date' ? 'bg-amber-700 text-white' : 'bg-white text-amber-900 ring-1 ring-amber-200'
              }`}
            >
              Set due date
            </button>
            <button
              type="button"
              onClick={() => onDueDateDecisionChange('none')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                dueDateDecision === 'none' ? 'bg-amber-700 text-white' : 'bg-white text-amber-900 ring-1 ring-amber-200'
              }`}
            >
              No due date
            </button>
          </div>
          {dueDateDecision === 'date' ? (
            <input
              className="input mt-2"
              name="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => onDueDateChange(e.target.value)}
            />
          ) : null}
          {dueDateDecision === 'unset' ? (
            <div className="mt-2 text-xs text-amber-800">Choose a due date or No due date before completing.</div>
          ) : null}
        </div>
      ) : null}

      {showCashControls ? (
        <div>
          <label className="label" htmlFor="pos-cash-tendered">
            {paymentStatus === 'PAID' && paymentMethods.length === 1
              ? 'Cash tendered (leave blank for exact)'
              : 'Cash tendered'}
          </label>
          <input
            id="pos-cash-tendered"
            className="input"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            ref={cashRef}
            value={cashTendered}
            onChange={(e) => onCashTenderedChange(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder={paymentStatus === 'PAID' ? 'Exact' : '0.00'}
          />
          <div className="mt-1.5 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-1.5">
            {POS_QUICK_CASH_DENOMINATIONS_GHS.map((amount) => (
              <button
                key={amount}
                type="button"
                className="rounded-md border border-black/10 bg-white px-3 py-2 text-center text-xs font-semibold hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                onClick={() => onCashTenderedChange(String(amount))}
              >
                {formatMoney(amount * 100, currency)}
              </button>
            ))}
            <button
              type="button"
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-700 hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-w-[5rem]"
              onClick={() => onCashTenderedChange(String(totalDue / 100))}
            >
              Exact
            </button>
          </div>
          {changeDue > 0 ? (
            <div className="mt-2 text-sm font-semibold text-accent">
              Change {formatMoney(changeDue, currency)}
            </div>
          ) : null}
        </div>
      ) : null}

      {(showCard || showTransfer || showMomo || (showSplitPanel && showMethods)) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(showCard || (showSplitPanel && hasMethod('CARD'))) && (
            <div>
              <label className="label">Card amount</label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={cardPaid}
                onChange={(e) => onCardPaidChange(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                placeholder={paymentStatus === 'PAID' && !isSplit ? 'Amount due' : '0.00'}
              />
              <input
                className="input mt-1.5"
                type="text"
                value={cardRefValue}
                onChange={(e) => onCardRefChange(e.target.value)}
                placeholder="Card ref (optional)"
                autoComplete="off"
              />
            </div>
          )}
          {(showTransfer || (showSplitPanel && hasMethod('TRANSFER'))) && (
            <div>
              <label className="label">Bank Transfer amount</label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={transferPaid}
                onChange={(e) => onTransferPaidChange(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                placeholder={paymentStatus === 'PAID' && !isSplit ? 'Amount due' : '0.00'}
              />
              <input
                className="input mt-1.5"
                type="text"
                value={transferRefValue}
                onChange={(e) => onTransferRefChange(e.target.value)}
                placeholder="Transfer ref (optional)"
                autoComplete="off"
              />
            </div>
          )}
          {showMomo && (
            <div>
              <label className="label flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
                MoMo amount
              </label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={momoPaid}
                onChange={(e) => onMomoPaidChange(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                placeholder={paymentStatus === 'PAID' && !isSplit ? 'Amount due' : '0.00'}
              />
              <select
                className="input mt-1.5"
                value={momoNetwork}
                onChange={(e) => onMomoNetworkChange(e.target.value as CollectionNetwork)}
              >
                <option value="MTN">MTN</option>
                <option value="TELECEL">Telecel</option>
                <option value="AIRTELTIGO">AirtelTigo</option>
              </select>
              <input
                className="input mt-1.5"
                type="tel"
                value={momoPayerMsisdn}
                onChange={(e) => onMomoPayerMsisdnChange(e.target.value)}
                placeholder="Payer number (optional)"
              />
              <input
                className="input mt-1.5"
                type="text"
                value={momoRef}
                onChange={(e) => onMomoRefChange(e.target.value)}
                placeholder="Transaction ref (optional)"
              />
              <div className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
                {nonCashConfirmInstruction()} {momoGuidance}
              </div>
            </div>
          )}
        </div>
      )}

      {!isUnpaid && (hasMethod('CARD') || hasMethod('TRANSFER')) && !hasMethod('MOBILE_MONEY') ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
          {nonCashConfirmInstruction()}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-x-4 gap-y-1 rounded-xl bg-black/[.02] px-3 py-2 text-sm">
        <div>
          <div className="text-[11px] text-black/40">Due</div>
          <div className="font-bold text-ink">{formatMoney(totalDue, currency)}</div>
        </div>
        {!isUnpaid ? (
          <div>
            <div className="text-[11px] text-black/40">Received</div>
            <div className="font-semibold">{formatMoney(totalPaid, currency)}</div>
          </div>
        ) : null}
        {isPartPaid || balanceRemaining > 0 ? (
          <div>
            <div className="text-[11px] text-black/40">Outstanding</div>
            <div className="font-semibold text-amber-700">{formatMoney(balanceRemaining, currency)}</div>
          </div>
        ) : null}
        {changeDue > 0 ? (
          <div>
            <div className="text-[11px] text-black/40">Change</div>
            <div className="font-semibold text-accent">{formatMoney(changeDue, currency)}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
