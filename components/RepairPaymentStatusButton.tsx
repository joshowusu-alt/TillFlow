'use client';

import { useState } from 'react';
import { repairPaymentStatusDriftAction } from '@/app/actions/repair';

export default function RepairPaymentStatusButton() {
  const [isPending, setPending] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    updatedSales?: number;
    updatedPurchases?: number;
    skippedReview?: number;
    error?: string;
  } | null>(null);

  const handleRepair = async () => {
    if (isPending) return;
    if (!confirm(
      'This will repair only invoice payment statuses where the payment total proves the correct status.\n\n' +
      'Example: PART_PAID invoices with payments covering the full total become PAID. Review-only mismatches are left untouched.\n\n' +
      'Continue?'
    )) {
      return;
    }

    setPending(true);
    setResult(null);
    try {
      const res = await repairPaymentStatusDriftAction();
      if (res.success) {
        setResult({ success: true, ...(res.data as any) });
      } else {
        setResult({ success: false, error: res.error ?? 'Payment status repair failed.' });
      }
    } catch {
      setResult({ success: false, error: 'Unexpected error during payment status repair.' });
    }
    finally {
      setPending(false);
    }
  };

  const updated = (result?.updatedSales ?? 0) + (result?.updatedPurchases ?? 0);

  return (
    <div>
      <button
        onClick={handleRepair}
        disabled={isPending}
        aria-busy={isPending}
        className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/10 disabled:opacity-50"
      >
        {isPending ? 'Repairing…' : 'Repair payment statuses'}
      </button>

      {result && (
        <div role={result.success ? 'status' : 'alert'} className={`mt-3 rounded-lg border px-3 py-2 text-xs ${result.success ? 'border-success/30 bg-success/5 text-success' : 'border-rose/30 bg-rose/5 text-rose'}`}>
          {result.success
            ? updated === 0
              ? `No repairable stale statuses found.${result.skippedReview ? ` ${result.skippedReview} need manual review.` : ''}`
              : `Updated ${updated} invoice status${updated === 1 ? '' : 'es'}.${result.skippedReview ? ` ${result.skippedReview} left for manual review.` : ''}`
            : (result.error ?? 'Payment status repair failed. Please try again.')}
        </div>
      )}
    </div>
  );
}
