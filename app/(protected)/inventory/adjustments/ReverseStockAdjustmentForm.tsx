'use client';

import { useState } from 'react';
import SubmitButton from '@/components/SubmitButton';
import { reverseInventoryAdjustmentAction } from '@/app/actions/inventory-reversal';

export default function ReverseStockAdjustmentForm({
  adjustmentId,
  storeId,
  disabled,
  isReversal,
}: {
  adjustmentId: string;
  storeId: string;
  disabled?: boolean;
  isReversal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (isReversal) {
    return <span className="pill bg-slate-100 text-slate-600">Reversal posting</span>;
  }

  if (disabled) {
    return <span className="pill bg-black/5 text-black/45">Already reversed</span>;
  }

  if (!open) {
    return (
      <button type="button" className="btn-secondary text-xs" onClick={() => setOpen(true)}>
        Reverse
      </button>
    );
  }

  return (
    <form action={reverseInventoryAdjustmentAction} className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/70 p-3">
      <input type="hidden" name="adjustmentId" value={adjustmentId} />
      <input type="hidden" name="storeId" value={storeId} />
      <label className="label">Reversal reason</label>
      <input
        className="input"
        name="reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Why this posted adjustment must be reversed"
        required
        minLength={3}
      />
      <div className="flex flex-wrap gap-2">
        <SubmitButton className="btn-primary text-xs" loadingText="Reversing…">
          Confirm reverse
        </SubmitButton>
        <button type="button" className="btn-secondary text-xs" onClick={() => setOpen(false)}>
          Keep original
        </button>
      </div>
    </form>
  );
}
