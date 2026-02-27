'use client';

import { useState } from 'react';
import { diagnoseDataAction, cleanOrphanedJournalEntriesAction, ownerVoidSaleAction } from '@/app/actions/repair';

type DiagResult = {
  totalSales: number;
  totalJournalEntries: number;
  orphanedJournalCount: number;
  salesByDate: Array<{ date: string; count: number; qaTag: string | null }>;
  journalEntriesByRef: Array<{ referenceType: string; count: number }>;
};

export default function DataDiagnosticPanel() {
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [diagResult, setDiagResult] = useState<DiagResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [voidId, setVoidId] = useState('');
  const [voidLoading, setVoidLoading] = useState(false);

  const runDiagnostic = async () => {
    setDiagnosticLoading(true);
    setMessage(null);
    try {
      const result = await diagnoseDataAction();
      if (result.success) {
        setDiagResult(result.data);
      } else {
        setMessage(result.error ?? 'Failed to run diagnostic');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error');
    }
    setDiagnosticLoading(false);
  };

  const cleanOrphans = async () => {
    setRepairLoading(true);
    setMessage(null);
    try {
      const result = await cleanOrphanedJournalEntriesAction();
      if (result.success) {
        setMessage(`Cleaned ${result.data.cleaned} orphaned journal entries.`);
        // Re-run diagnostic
        await runDiagnostic();
      } else {
        setMessage(result.error ?? 'Failed');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error');
    }
    setRepairLoading(false);
  };

  const voidSale = async () => {
    const id = voidId.trim();
    if (!id) return;
    if (!confirm(`Are you sure you want to void sale "${id}"? This cannot be undone.`)) return;

    setVoidLoading(true);
    setMessage(null);
    try {
      const result = await ownerVoidSaleAction(id);
      if (result.success) {
        setMessage('Sale voided successfully.');
        setVoidId('');
      } else {
        setMessage(result.error ?? 'Failed to void sale');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error');
    }
    setVoidLoading(false);
  };

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {message}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary text-xs" onClick={runDiagnostic} disabled={diagnosticLoading}>
          {diagnosticLoading ? 'Running...' : 'Run Data Diagnostic'}
        </button>
      </div>

      {diagResult && (
        <div className="space-y-3 text-sm">
          <div className="rounded-xl border border-black/10 bg-black/5 p-4 space-y-2">
            <div className="font-semibold">Summary</div>
            <div>Total sales invoices: <strong>{diagResult.totalSales}</strong></div>
            <div>Total journal entries: <strong>{diagResult.totalJournalEntries}</strong></div>
            <div>Orphaned journal entries (ref deleted sales): <strong className={diagResult.orphanedJournalCount > 0 ? 'text-rose-600' : ''}>{diagResult.orphanedJournalCount}</strong></div>
          </div>

          <div className="rounded-xl border border-black/10 bg-black/5 p-4 space-y-1">
            <div className="font-semibold mb-2">Sales by Date</div>
            {diagResult.salesByDate.length === 0 && <div className="text-black/50">No sales found</div>}
            {diagResult.salesByDate.map((row: any, i: number) => (
              <div key={i} className="flex gap-3">
                <span className="font-mono">{row.date}</span>
                <span>{row.count} sale{row.count !== 1 ? 's' : ''}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${row.qaTag ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  {row.qaTag ?? 'REAL'}
                </span>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-black/10 bg-black/5 p-4 space-y-1">
            <div className="font-semibold mb-2">Journal Entries by Type</div>
            {diagResult.journalEntriesByRef.map((row: any, i: number) => (
              <div key={i} className="flex gap-3">
                <span className="font-mono">{row.referenceType}</span>
                <span>{row.count} entries</span>
              </div>
            ))}
          </div>

          {diagResult.orphanedJournalCount > 0 && (
            <button className="btn-primary text-xs" onClick={cleanOrphans} disabled={repairLoading}>
              {repairLoading ? 'Cleaning...' : `Clean ${diagResult.orphanedJournalCount} Orphaned Journal Entries`}
            </button>
          )}
        </div>
      )}

      <div className="border-t border-black/10 pt-4">
        <div className="font-semibold text-sm mb-2">Void a Sale (Owner Override)</div>
        <p className="text-xs text-black/50 mb-2">
          Enter the sale ID to void it. This bypasses manager PIN — owner only.
          Find the sale ID from the sales list (click on the invoice link).
        </p>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Sale ID (e.g. cm...)"
            value={voidId}
            onChange={(e) => setVoidId(e.target.value)}
          />
          <button className="btn-primary text-xs whitespace-nowrap" onClick={voidSale} disabled={voidLoading || !voidId.trim()}>
            {voidLoading ? 'Voiding...' : 'Void Sale'}
          </button>
        </div>
      </div>
    </div>
  );
}
