'use client';

import { useState, useTransition } from 'react';
import { clearSampleData } from '@/app/actions/demo-day';

export default function ClearSampleDataButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; removed: string[]; error?: string } | null>(null);

  const handleClear = () => {
    if (!confirm('This will permanently delete all sample products, demo sales, demo expenses, sample customers, and empty categories.\n\nYour real data (sales, products you added yourself, etc.) will NOT be affected.\n\nContinue?')) {
      return;
    }
    startTransition(async () => {
      const res = await clearSampleData();
      setResult(res);
    });
  };

  return (
    <div>
      <button
        onClick={handleClear}
        disabled={isPending}
        className="rounded-lg border border-rose/30 bg-rose/5 px-4 py-2 text-sm font-medium text-rose transition hover:bg-rose/10 disabled:opacity-50"
      >
        {isPending ? 'Clearing…' : 'Clear Sample Data'}
      </button>

      {result && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${result.ok ? 'border-success/30 bg-success/5 text-success' : 'border-rose/30 bg-rose/5 text-rose'}`}>
          {result.ok ? (
            result.removed.length > 0
              ? <>Removed: {result.removed.join(', ')}.</>
              : <>No sample data found to remove.</>
          ) : (
            result.error
          )}
        </div>
      )}
    </div>
  );
}
