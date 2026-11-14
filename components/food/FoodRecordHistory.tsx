'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { undoFoodRecordAction } from '@/app/actions/food';
import type { loadFoodRecordHistory } from '@/lib/food/record-history';

export default function FoodRecordHistory({ records, storeId, title }: {
  records: Awaited<ReturnType<typeof loadFoodRecordHistory>>; storeId: string; title: string;
}) {
  return <section className="card space-y-3 p-4">
    <h2 className="font-semibold">{title}</h2>
    {records.length === 0 ? <p className="text-sm text-muted">No records yet.</p> : (
      <ul className="divide-y">
        {records.map(record => <HistoryRow key={record.id} record={record} storeId={storeId} />)}
      </ul>
    )}
  </section>;
}

function HistoryRow({ record, storeId }: {
  record: Awaited<ReturnType<typeof loadFoodRecordHistory>>[number]; storeId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return <li className="space-y-2 py-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="font-medium">{record.label}</p>
        <p className="text-sm text-muted">{record.createdAt}</p>
      </div>
      {record.undoneAt ? <strong className="text-sm">Undone</strong> :
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary" disabled={open}>
          {record.kind === 'FOOD_PREPARATION' ? 'Undo cooking' : 'Undo ingredients used'}
        </button>}
    </div>
    {record.undoneAt && <p className="text-sm">By {record.undoneBy} on {record.undoneAt}. {record.reason}</p>}
    {open && !record.undoneAt && <form className="space-y-2 rounded border p-3" onSubmit={async event => {
      event.preventDefault();
      setPending(true);
      setError('');
      try {
        const result = await undoFoodRecordAction({ storeId, kind: record.kind, id: record.id, reason });
        if (!result.success) setError(result.error);
        else router.refresh();
      } catch {
        setError('Could not confirm the undo. Refresh to check the record before trying again.');
      } finally {
        setPending(false);
      }
    }}>
      <p className="text-sm">{record.kind === 'FOOD_PREPARATION'
        ? 'This removes the whole cooked batch and returns its ingredients to stock. The batch must be unused.'
        : 'This returns the ingredients to stock and reverses the recorded food cost.'}</p>
      <label className="block text-sm">Reason for undo
        <input className="input mt-1 w-full" required maxLength={240} value={reason} onChange={event => setReason(event.target.value)} />
      </label>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending || !reason.trim()}>Confirm undo</button>
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => { setOpen(false); setError(''); }}>Cancel</button>
      </div>
    </form>}
  </li>;
}
