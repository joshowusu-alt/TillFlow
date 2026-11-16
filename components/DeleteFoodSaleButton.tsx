'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import ResponsiveModal from '@/components/ResponsiveModal';
import { deleteFoodSaleAction } from '@/app/actions/returns';

export default function DeleteFoodSaleButton({ invoiceId, preview }: {
  invoiceId: string;
  preview: { mixedTender: boolean; refund: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const close = useCallback(() => { if (!busy) setOpen(false); }, [busy]);
  if (preview.mixedTender) return <span className="text-xs text-black/65">Paid more than one way — use Return</span>;
  return <>
    <button type="button" className="btn-secondary text-xs text-red-700" onClick={() => {
      setReason(''); setNote(''); setError(''); setOpen(true);
    }}>Delete sale</button>
    {open && <ResponsiveModal open ariaLabel="Delete this sale?" closeOnBackdrop={false} closeOnEscape={!busy}
      onClose={close}>
      <form className="space-y-4 p-4" onSubmit={async event => {
        event.preventDefault();
        if (!reason || busy) return;
        setBusy(true);
        setError('');
        try {
          const result = await deleteFoodSaleAction(invoiceId, reason, note);
          if (result.success) {
            setOpen(false);
            router.refresh();
          } else setError(result.error);
        } catch {
          setError('Could not confirm the deletion. Refresh before trying again.');
        } finally {
          setBusy(false);
        }
      }}>
        <h2 className="text-lg font-semibold">Delete this sale?</h2>
        <p className="text-sm">This reverses the sale and returns its items to stock.</p>
        {preview.refund && <p className="text-sm font-medium">{preview.refund}</p>}
        <label className="block">Reason<select required className="input mt-1" value={reason} onChange={event => setReason(event.target.value)}>
          <option value="">Choose a reason</option><option value="TEST_SALE">Test sale</option><option value="MISTAKE">Mistake</option>
        </select></label>
        <label className="block">Note (optional)<textarea className="input mt-1" maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          <button type="submit" className="btn-destructive" disabled={!reason || busy}>{busy ? 'Deleting…' : 'Delete sale'}</button>
        </div>
      </form>
    </ResponsiveModal>}
  </>;
}
