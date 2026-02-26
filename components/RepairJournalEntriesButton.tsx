'use client';

import { useState, useTransition } from 'react';
import { repairPurchaseJournalEntriesAction, repairSalesJournalEntriesAction } from '@/app/actions/repair';

export default function RepairJournalEntriesButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    success: boolean;
    purchasesRepaired?: number;
    salesRepaired?: number;
    error?: string;
  } | null>(null);

  const handleRepair = () => {
    if (!confirm(
      'This will scan your purchase invoices AND sales invoices, then create any missing accounting entries.\n\n' +
      'It is safe to run at any time — already-posted entries are not duplicated.\n\n' +
      'Continue?'
    )) {
      return;
    }
    startTransition(async () => {
      try {
        const [purchaseRes, salesRes] = await Promise.all([
          repairPurchaseJournalEntriesAction(),
          repairSalesJournalEntriesAction(),
        ]);

        const purchasesRepaired = purchaseRes.success
          ? (purchaseRes.data as { repaired: number }).repaired
          : 0;
        const salesRepaired = salesRes.success
          ? (salesRes.data as { repaired: number }).repaired
          : 0;

        if (!purchaseRes.success || !salesRes.success) {
          const errors = [
            !purchaseRes.success ? purchaseRes.error : null,
            !salesRes.success ? salesRes.error : null,
          ].filter(Boolean).join('; ');
          setResult({ success: false, error: errors || 'Repair failed.' });
        } else {
          setResult({ success: true, purchasesRepaired, salesRepaired });
        }
      } catch (err) {
        setResult({ success: false, error: 'Unexpected error during repair.' });
      }
    });
  };

  const formatResult = () => {
    if (!result || !result.success) return null;
    const p = result.purchasesRepaired ?? 0;
    const s = result.salesRepaired ?? 0;
    if (p === 0 && s === 0) {
      return 'All accounting entries are already up to date — nothing to repair.';
    }
    const parts: string[] = [];
    if (p > 0) parts.push(`${p} purchase invoice${p === 1 ? '' : 's'}`);
    if (s > 0) parts.push(`${s} sales invoice${s === 1 ? '' : 's'}`);
    return `Repaired ${parts.join(' and ')}. Refresh reports to see the updated figures.`;
  };

  return (
    <div>
      <button
        onClick={handleRepair}
        disabled={isPending}
        className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/10 disabled:opacity-50"
      >
        {isPending ? 'Repairing…' : 'Repair Accounting Entries'}
      </button>

      {result && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${result.success ? 'border-success/30 bg-success/5 text-success' : 'border-rose/30 bg-rose/5 text-rose'}`}>
          {result.success ? formatResult() : (result.error ?? 'Repair failed. Please try again.')}
        </div>
      )}
    </div>
  );
}
