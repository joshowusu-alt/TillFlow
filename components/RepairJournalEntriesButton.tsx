'use client';

import { useState, useTransition } from 'react';
import { repairPurchaseJournalEntriesAction } from '@/app/actions/repair';

export default function RepairJournalEntriesButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success: boolean; repaired?: number; error?: string } | null>(null);

  const handleRepair = () => {
    if (!confirm(
      'This will scan your purchase invoices and create any missing accounting entries.\n\n' +
      'It is safe to run at any time — already-posted entries are not duplicated.\n\n' +
      'Continue?'
    )) {
      return;
    }
    startTransition(async () => {
      const res = await repairPurchaseJournalEntriesAction();
      if (res.success) {
        setResult({ success: true, repaired: (res.data as { repaired: number }).repaired });
      } else {
        setResult({ success: false, error: res.error });
      }
    });
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
          {result.success ? (
            result.repaired === 0
              ? 'All accounting entries are already up to date — nothing to repair.'
              : `Repaired ${result.repaired} purchase invoice${result.repaired === 1 ? '' : 's'}. Refresh the Balance Sheet to see the updated figures.`
          ) : (
            result.error ?? 'Repair failed. Please try again.'
          )}
        </div>
      )}
    </div>
  );
}
