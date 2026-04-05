'use client';

import { useState, useTransition } from 'react';
import { repairInventoryAverageCostsAction } from '@/app/actions/repair';

export default function RepairInventoryAverageCostsButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    success: boolean;
    affectedProducts?: number;
    syncedBalances?: number;
    skippedAuthoritativeBalances?: number;
    error?: string;
  } | null>(null);

  const handleRepair = () => {
    if (!confirm(
      'This will repair stale inventory average cost by syncing it to the current product default cost only for stores that do not have authoritative inbound stock-cost history.\n\n' +
      'Balances created from purchases, transfer-ins, sale voids, or sales returns are preserved.\n\n' +
      'Safe to run multiple times. Continue?'
    )) {
      return;
    }

    startTransition(async () => {
      try {
        const res = await repairInventoryAverageCostsAction();
        if (res.success) {
          setResult({
            success: true,
            ...(res.data as {
              affectedProducts: number;
              syncedBalances: number;
              skippedAuthoritativeBalances: number;
            }),
          });
        } else {
          setResult({ success: false, error: res.error ?? 'Inventory cost repair failed.' });
        }
      } catch {
        setResult({ success: false, error: 'Unexpected error during inventory cost repair.' });
      }
    });
  };

  const formatSuccess = () => {
    if (!result?.success) return null;
    const syncedBalances = result.syncedBalances ?? 0;
    const affectedProducts = result.affectedProducts ?? 0;
    const skipped = result.skippedAuthoritativeBalances ?? 0;

    if (syncedBalances === 0) {
      return skipped > 0
        ? `No default-cost-managed balances needed syncing. ${skipped} balance${skipped === 1 ? '' : 's'} already had authoritative inbound cost history and were left unchanged.`
        : 'All inventory average costs already align with their current product defaults.';
    }

    return `Synced ${syncedBalances} inventory balance${syncedBalances === 1 ? '' : 's'} across ${affectedProducts} product${affectedProducts === 1 ? '' : 's'}. ${skipped > 0 ? `${skipped} authoritative balance${skipped === 1 ? '' : 's'} were preserved.` : 'Future sales and inventory margins will now use the corrected cost.'}`;
  };

  return (
    <div>
      <button
        onClick={handleRepair}
        disabled={isPending}
        className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/10 disabled:opacity-50"
      >
        {isPending ? 'Repairing…' : 'Repair inventory average costs'}
      </button>

      {result && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${result.success ? 'border-success/30 bg-success/5 text-success' : 'border-rose/30 bg-rose/5 text-rose'}`}>
          {result.success ? formatSuccess() : (result.error ?? 'Inventory cost repair failed. Please try again.')}
        </div>
      )}
    </div>
  );
}
