'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ResponsiveModal from '@/components/ResponsiveModal';
import { setPurchaseDueDateAction } from '@/app/actions/purchases';

interface Props {
  invoiceId: string;
  currentDueDate?: Date | string | null;
  onDone?: () => void;
}

export default function SetPurchaseDueDateButton({ invoiceId, currentDueDate, onDone }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initialValue =
    currentDueDate
      ? (typeof currentDueDate === 'string' ? currentDueDate : currentDueDate.toISOString()).slice(0, 10)
      : '';

  const [dateVal, setDateVal] = useState(initialValue);

  function handleOpen() {
    setDateVal(initialValue);
    setError(null);
    setOpen(true);
  }

  function handleSave(clear = false) {
    startTransition(async () => {
      const result = await setPurchaseDueDateAction(invoiceId, clear ? null : dateVal || null);
      if (!result.success) {
        setError(result.error ?? 'Something went wrong.');
        return;
      }
      setOpen(false);
      onDone?.();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-xs text-black/40 hover:bg-black/5 hover:text-black/70 transition-colors"
        title="Edit due date"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-8.207 8.207-3.536.707.707-3.535 8.208-8.207z" />
        </svg>
      </button>

      <ResponsiveModal
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel="Set due date"
        maxWidthClassName="max-w-sm"
        footer={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleSave(false)}
              className="btn-primary flex-1"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
            {currentDueDate && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleSave(true)}
                className="btn-secondary flex-1"
              >
                Clear date
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-ghost flex-1"
            >
              Cancel
            </button>
          </div>
        }
      >
        <div className="space-y-4 p-4">
          <h2 className="text-base font-semibold">Set due date</h2>
          <p className="text-sm text-black/50">
            Update the payment due date for this invoice. This affects the Supplier Aging report.
          </p>
          <div>
            <label className="block text-xs font-medium text-black/60 mb-1">Due date</label>
            <input
              type="date"
              className="input w-full"
              value={dateVal}
              onChange={(e) => setDateVal(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </ResponsiveModal>
    </>
  );
}
