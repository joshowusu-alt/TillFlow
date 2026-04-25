'use client';

import SubmitButton from '@/components/SubmitButton';
import { reverseStockAdjustmentAction } from '@/app/actions/inventory';

export default function ReverseStockAdjustmentForm({
  adjustmentId,
  disabled,
}: {
  adjustmentId: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return <span className="pill bg-black/5 text-black/45">Reversal recorded</span>;
  }

  return (
    <form
      action={reverseStockAdjustmentAction}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={(event) => {
        if (!window.confirm('Reverse this stock adjustment? This creates an opposite audited stock entry.')) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="adjustmentId" value={adjustmentId} />
      <input
        className="input h-9 min-w-[12rem] text-xs"
        name="reason"
        placeholder="Correction note"
        maxLength={180}
      />
      <SubmitButton className="btn-secondary h-9 px-3 text-xs" loadingText="Reversing...">
        Reverse
      </SubmitButton>
    </form>
  );
}
