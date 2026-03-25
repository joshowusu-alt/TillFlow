'use client';

import { useState, useTransition } from 'react';
import {
  saveCashBankOpeningBalances,
  saveOpeningAR,
  saveOpeningAP,
} from '@/app/actions/opening-balances';

type Customer = { id: string; name: string };
type Supplier = { id: string; name: string };

type OBRecord = {
  accountCode: string;
  amountPence: number;
};

type ARInvoice = {
  customerId: string;
  customerName: string;
  totalPence: number;
};

type APInvoice = {
  supplierId: string;
  supplierName: string;
  totalPence: number;
};

type Props = {
  currencySymbol: string;
  customers: Customer[];
  suppliers: Supplier[];
  openingBalances: OBRecord[];
  arInvoices: ARInvoice[];
  apInvoices: APInvoice[];
};

function toPence(val: string | number): number {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function fromPence(pence: number): string {
  return (pence / 100).toFixed(2);
}

export default function OpeningBalancesForm({
  currencySymbol,
  customers,
  suppliers,
  openingBalances,
  arInvoices,
  apInvoices,
}: Props) {
  const obMap = new Map(openingBalances.map(ob => [ob.accountCode, ob.amountPence]));

  const [cashOnHand, setCashOnHand] = useState(fromPence(obMap.get('1000') ?? 0));
  const [bankBalance, setBankBalance] = useState(fromPence(obMap.get('1010') ?? 0));
  const [cashBankMsg, setCashBankMsg] = useState('');

  const [arRows, setArRows] = useState<{ customerId: string; amount: string }[]>(
    arInvoices.length > 0
      ? arInvoices.map(inv => ({ customerId: inv.customerId, amount: fromPence(inv.totalPence) }))
      : [{ customerId: '', amount: '' }],
  );
  const [arMsg, setArMsg] = useState('');

  const [apRows, setApRows] = useState<{ supplierId: string; amount: string }[]>(
    apInvoices.length > 0
      ? apInvoices.map(inv => ({ supplierId: inv.supplierId, amount: fromPence(inv.totalPence) }))
      : [{ supplierId: '', amount: '' }],
  );
  const [apMsg, setApMsg] = useState('');

  const [isPending, startTransition] = useTransition();

  // Computed totals
  const totalAR = arRows.reduce((sum, r) => sum + toPence(r.amount), 0);
  const totalAP = apRows.reduce((sum, r) => sum + toPence(r.amount), 0);
  const totalAssets = toPence(cashOnHand) + toPence(bankBalance) + totalAR + (obMap.get('1200') ?? 0);
  const ownersCapital = totalAssets - totalAP;

  // ---- Cash & Bank ----
  function handleSaveCashBank() {
    setCashBankMsg('');
    startTransition(async () => {
      const result = await saveCashBankOpeningBalances({
        cashOnHandPence: toPence(cashOnHand),
        bankBalancePence: toPence(bankBalance),
      });
      setCashBankMsg(result.success ? 'Saved ✓' : result.error);
    });
  }

  // ---- AR ----
  function addArRow() {
    setArRows(prev => [...prev, { customerId: '', amount: '' }]);
  }
  function removeArRow(idx: number) {
    setArRows(prev => prev.filter((_, i) => i !== idx));
  }
  function handleSaveAR() {
    setArMsg('');
    const entries = arRows
      .filter(r => r.customerId && toPence(r.amount) > 0)
      .map(r => ({ customerId: r.customerId, amountPence: toPence(r.amount) }));
    startTransition(async () => {
      const result = await saveOpeningAR(entries);
      setArMsg(result.success ? 'Saved ✓' : result.error);
    });
  }

  // ---- AP ----
  function addApRow() {
    setApRows(prev => [...prev, { supplierId: '', amount: '' }]);
  }
  function removeApRow(idx: number) {
    setApRows(prev => prev.filter((_, i) => i !== idx));
  }
  function handleSaveAP() {
    setApMsg('');
    const entries = apRows
      .filter(r => r.supplierId && toPence(r.amount) > 0)
      .map(r => ({ supplierId: r.supplierId, amountPence: toPence(r.amount) }));
    startTransition(async () => {
      const result = await saveOpeningAP(entries);
      setApMsg(result.success ? 'Saved ✓' : result.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-accent/10 bg-[linear-gradient(135deg,rgba(37,99,235,0.08),rgba(255,255,255,0.96))] p-5 shadow-[0_18px_48px_rgba(37,99,235,0.08)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-accent/15 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              Opening balances guide
            </div>
            <h3 className="mt-3 text-base font-semibold text-black">How each opening balance behaves</h3>
            <p className="mt-1 max-w-3xl text-sm text-black/55">
              TillFlow records simple balances directly into accounting, while customer and supplier debts become real unpaid invoices you can work with later.
            </p>
          </div>
          <div className="text-xs text-black/45">
            Built for Ghana-first retail bookkeeping and everyday branch operations.
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {[
            {
              account: 'Cash on Hand',
              method: 'Simple amount field',
              result: 'Saves an OpeningBalance record and posts a journal entry: debit cash, credit equity.',
            },
            {
              account: 'Bank Balance',
              method: 'Simple amount field',
              result: 'Saves an OpeningBalance record and posts a journal entry: debit bank, credit equity.',
            },
            {
              account: 'AR (Customer Debts)',
              method: 'Per-customer rows',
              result: 'Creates real unpaid SalesInvoices that can later be collected through customer receipt flows.',
            },
            {
              account: 'AP (Supplier Debts)',
              method: 'Per-supplier rows',
              result: 'Creates real unpaid PurchaseInvoices that can later be settled through supplier payment flows.',
            },
            {
              account: 'Inventory',
              method: 'Opening stock setup link',
              result: 'Use the dedicated opening stock wizard to capture quantities and costs for stock already on hand.',
            },
            {
              account: "Owner's Capital",
              method: 'Auto-calculated summary',
              result: 'Shown below as assets minus liabilities based on the opening balances saved in this screen.',
            },
          ].map((item) => (
            <div
              key={item.account}
              className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-semibold text-black">{item.account}</h4>
                <span className="rounded-full bg-accentSoft px-2.5 py-1 text-[11px] font-semibold text-accent">
                  {item.method}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-black/60">{item.result}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cash & Bank */}
      <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-4">
        <h3 className="text-sm font-semibold">Cash & Bank</h3>
        <p className="mt-1 text-xs text-black/50">
          Cash on hand and bank balance when you started using TillFlow.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Cash on Hand ({currencySymbol})</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={cashOnHand}
              onChange={e => setCashOnHand(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Bank Balance ({currencySymbol})</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={bankBalance}
              onChange={e => setBankBalance(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            className="btn btn-primary text-sm"
            disabled={isPending}
            onClick={handleSaveCashBank}
          >
            {isPending ? 'Saving…' : 'Save Cash & Bank'}
          </button>
          {cashBankMsg && (
            <span className={`text-xs ${cashBankMsg.includes('✓') ? 'text-green-600' : 'text-red-600'}`}>
              {cashBankMsg}
            </span>
          )}
        </div>
      </div>

      {/* Accounts Receivable */}
      <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-4">
        <h3 className="text-sm font-semibold">Accounts Receivable (Customer Debts)</h3>
        <p className="mt-1 text-xs text-black/50">
          Money customers owed you when you started. Each entry creates a trackable invoice you can collect through Customer Receipts.
        </p>
        <div className="mt-3 space-y-2">
          {arRows.map((row, idx) => (
            <div key={idx} className="rounded-xl border border-black/5 bg-white/70 p-3 sm:border-0 sm:bg-transparent sm:p-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                {idx === 0 && <label className="label">Customer</label>}
                <select
                  className="input"
                  value={row.customerId}
                  onChange={e => {
                    const next = [...arRows];
                    next[idx] = { ...next[idx], customerId: e.target.value };
                    setArRows(next);
                  }}
                >
                  <option value="">Select customer…</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:w-36">
                {idx === 0 && <label className="label">Amount ({currencySymbol})</label>}
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.amount}
                  onChange={e => {
                    const next = [...arRows];
                    next[idx] = { ...next[idx], amount: e.target.value };
                    setArRows(next);
                  }}
                />
              </div>
              <button
                type="button"
                className="self-end text-lg leading-none text-red-500 hover:text-red-700 sm:mb-0.5"
                onClick={() => removeArRow(idx)}
                title="Remove"
              >
                ×
              </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-2 text-xs text-black/50 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className="text-accent hover:underline" onClick={addArRow}>
            + Add customer
          </button>
          <span>Total: {currencySymbol} {fromPence(totalAR)}</span>
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            className="btn btn-primary text-sm"
            disabled={isPending}
            onClick={handleSaveAR}
          >
            {isPending ? 'Saving…' : 'Save Customer Debts'}
          </button>
          {arMsg && (
            <span className={`text-xs ${arMsg.includes('✓') ? 'text-green-600' : 'text-red-600'}`}>
              {arMsg}
            </span>
          )}
        </div>
      </div>

      {/* Accounts Payable */}
      <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-4">
        <h3 className="text-sm font-semibold">Accounts Payable (Supplier Debts)</h3>
        <p className="mt-1 text-xs text-black/50">
          Money you owed suppliers when you started. Each entry creates a trackable invoice you can settle through Supplier Payments.
        </p>
        <div className="mt-3 space-y-2">
          {apRows.map((row, idx) => (
            <div key={idx} className="rounded-xl border border-black/5 bg-white/70 p-3 sm:border-0 sm:bg-transparent sm:p-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                {idx === 0 && <label className="label">Supplier</label>}
                <select
                  className="input"
                  value={row.supplierId}
                  onChange={e => {
                    const next = [...apRows];
                    next[idx] = { ...next[idx], supplierId: e.target.value };
                    setApRows(next);
                  }}
                >
                  <option value="">Select supplier…</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:w-36">
                {idx === 0 && <label className="label">Amount ({currencySymbol})</label>}
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.amount}
                  onChange={e => {
                    const next = [...apRows];
                    next[idx] = { ...next[idx], amount: e.target.value };
                    setApRows(next);
                  }}
                />
              </div>
              <button
                type="button"
                className="self-end text-lg leading-none text-red-500 hover:text-red-700 sm:mb-0.5"
                onClick={() => removeApRow(idx)}
                title="Remove"
              >
                ×
              </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-2 text-xs text-black/50 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className="text-accent hover:underline" onClick={addApRow}>
            + Add supplier
          </button>
          <span>Total: {currencySymbol} {fromPence(totalAP)}</span>
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            className="btn btn-primary text-sm"
            disabled={isPending}
            onClick={handleSaveAP}
          >
            {isPending ? 'Saving…' : 'Save Supplier Debts'}
          </button>
          {apMsg && (
            <span className={`text-xs ${apMsg.includes('✓') ? 'text-green-600' : 'text-red-600'}`}>
              {apMsg}
            </span>
          )}
        </div>
      </div>

      {/* Inventory link */}
      <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-4">
        <h3 className="text-sm font-semibold">Opening Inventory</h3>
        <p className="mt-1 text-xs text-black/50">
          Stock you already had before going live on TillFlow.
        </p>
        <a
          href="/setup/opening-stock"
          className="mt-3 inline-block btn btn-secondary text-sm"
        >
          Go to Opening Stock Setup →
        </a>
      </div>

      {/* Summary */}
      <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
        <h3 className="text-sm font-semibold text-accent">Owner&apos;s Capital (auto-calculated)</h3>
        <p className="mt-1 text-xs text-black/50">
          Total Assets minus Total Liabilities. This is your equity in the business.
        </p>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between">
            <span className="text-black/60">Cash on Hand</span>
            <span>{currencySymbol} {cashOnHand || '0.00'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-black/60">Bank Balance</span>
            <span>{currencySymbol} {bankBalance || '0.00'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-black/60">Accounts Receivable</span>
            <span>{currencySymbol} {fromPence(totalAR)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-black/60">Accounts Payable</span>
            <span className="text-red-600">({currencySymbol} {fromPence(totalAP)})</span>
          </div>
          <div className="sm:col-span-2 border-t border-black/10 pt-2 flex justify-between font-semibold">
            <span>Owner&apos;s Capital</span>
            <span className={ownersCapital >= 0 ? 'text-green-700' : 'text-red-600'}>
              {currencySymbol} {fromPence(ownersCapital)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
