'use client';

import { useState } from 'react';
import { restoreOrphanedSaleProducts } from '@/app/actions/repair';

export default function RestoreOrphanedProductsButton() {
  const [isPending, setPending] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    restored?: number;
    error?: string;
  } | null>(null);

  const handleRestore = async () => {
    if (isPending) return;
    if (!confirm(
      'This will scan your sales for products that were accidentally deleted ' +
      '(e.g. by Clear Sample Data) and restore them.\n\n' +
      'It is safe to run at any time — already-existing products are not affected.\n\n' +
      'Continue?'
    )) {
      return;
    }
    setPending(true);
    setResult(null);
    try {
      const res = await restoreOrphanedSaleProducts();
      if (res.success) {
        const restored = (res.data as { restored: number }).restored;
        setResult({ success: true, restored });
      } else {
        setResult({ success: false, error: res.error ?? 'Restore failed.' });
      }
    } catch {
      setResult({ success: false, error: 'Unexpected error during restore.' });
    }
    finally {
      setPending(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleRestore}
        disabled={isPending}
        aria-busy={isPending}
        className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/10 disabled:opacity-50"
      >
        {isPending ? 'Restoring…' : 'Restore Deleted Products'}
      </button>

      {result && (
        <div role={result.success ? 'status' : 'alert'} className={`mt-3 rounded-lg border px-3 py-2 text-xs ${result.success ? 'border-success/30 bg-success/5 text-success' : 'border-rose/30 bg-rose/5 text-rose'}`}>
          {result.success
            ? result.restored === 0
              ? 'No orphaned products found — all sales have valid product references.'
              : `Restored ${result.restored} product${result.restored === 1 ? '' : 's'}. Your sales data should now display correctly.`
            : (result.error ?? 'Restore failed. Please try again.')}
        </div>
      )}
    </div>
  );
}
