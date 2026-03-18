'use client';

import { useState, useTransition } from 'react';
import { backfillLineCostAction } from '@/app/actions/repair';

export default function BackfillLineCostButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    success: boolean;
    updated?: number;
    error?: string;
  } | null>(null);

  const handleBackfill = () => {
    if (!confirm(
      'This will populate the historical cost on all existing sales invoice lines that don\'t have one yet.\n\n' +
      'It uses the stock movement record from each sale where available, falling back to the product\'s current cost.\n\n' +
      'Safe to run multiple times. Continue?'
    )) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await backfillLineCostAction();
        if (res.success) {
          setResult({ success: true, updated: (res.data as { updated: number }).updated });
        } else {
          setResult({ success: false, error: res.error ?? 'Backfill failed.' });
        }
      } catch {
        setResult({ success: false, error: 'Unexpected error during backfill.' });
      }
    });
  };

  return (
    <div>
      <button
        onClick={handleBackfill}
        disabled={isPending}
        className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/10 disabled:opacity-50"
      >
        {isPending ? 'Backfilling…' : 'Backfill Line Costs'}
      </button>

      {result && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${result.success ? 'border-success/30 bg-success/5 text-success' : 'border-rose/30 bg-rose/5 text-rose'}`}>
          {result.success
            ? result.updated === 0
              ? 'All invoice lines already have cost data — nothing to backfill.'
              : `Updated ${result.updated} invoice line${result.updated === 1 ? '' : 's'}. Refresh reports to see corrected margins.`
            : (result.error ?? 'Backfill failed. Please try again.')}
        </div>
      )}
    </div>
  );
}
