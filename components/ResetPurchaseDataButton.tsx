'use client';

import { useState } from 'react';

type ResetResult = {
  invoicesRemoved: number;
  journalEntriesRemoved: number;
  stockMovementsRemoved: number;
  inventoryBalancesReset: number;
};

export default function ResetPurchaseDataButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<ResetResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleReset = async () => {
    if (
      !confirm(
        'This will permanently delete ALL purchase invoices, journal entries, stock movements, and inventory balances for your business.\n\n' +
          'Your products and categories will be kept intact.\n\n' +
          'After resetting, re-run the stock import once to record the correct opening figures.\n\n' +
          'Continue?'
      )
    )
      return;

    setStatus('loading');
    setResult(null);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/reset-purchase-data', { method: 'POST' });
      const json = await res.json();
      if (!json.success) {
        setErrorMsg(json.error ?? 'Reset failed. Please try again.');
        setStatus('error');
        return;
      }
      setResult(json.data);
      setStatus('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Reset failed.');
      setStatus('error');
    }
  };

  return (
    <div className="card p-5" style={{ border: '1px solid #fecaca', background: '#fff1f2' }}>
      <h3 className="mb-1 font-semibold" style={{ color: '#991b1b' }}>Reset purchase &amp; inventory data</h3>
      <p className="mb-4 text-sm" style={{ color: '#b91c1c' }}>
        If you imported stock multiple times due to earlier errors, your inventory totals and balance
        sheet will be inflated. Use this to wipe all purchase invoices, journal entries, and stock
        balances — keeping your product catalogue — then re-run the import once to get clean
        figures.
      </p>

      {status === 'done' && result && (
        <div className="mb-4 rounded-lg bg-white p-4 text-sm text-gray-700 shadow-sm">
          <p className="mb-1 font-medium text-green-700">Reset complete. Data removed:</p>
          <ul className="ml-4 list-disc space-y-0.5 text-gray-600">
            <li>{result.invoicesRemoved} purchase invoice(s)</li>
            <li>{result.journalEntriesRemoved} journal entry(ies)</li>
            <li>{result.stockMovementsRemoved} stock movement(s)</li>
            <li>{result.inventoryBalancesReset} inventory balance(s) cleared</li>
          </ul>
          <p className="mt-2 text-gray-500">
            You can now re-run the stock import above to record correct opening stock.
          </p>
        </div>
      )}

      {status === 'error' && errorMsg && (
        <p className="mb-4 text-sm font-medium" style={{ color: '#b91c1c' }}>{errorMsg}</p>
      )}

      <button
        onClick={handleReset}
        disabled={status === 'loading'}
        className="btn-destructive"
      >
        {status === 'loading' ? 'Resetting…' : 'Reset purchase & inventory data'}
      </button>
    </div>
  );
}
