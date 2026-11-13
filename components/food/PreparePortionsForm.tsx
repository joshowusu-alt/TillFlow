'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addPreparedPortionsAction } from '@/app/actions/food';

export default function PreparePortionsForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [qty, setQty] = useState('10');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await addPreparedPortionsAction({
      productId,
      qty: Math.floor(Number(qty)),
      note,
      idempotencyKey: crypto.randomUUID(),
    });
    setPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setMessage(`Added ${result.data.qty} portions. This updates the count only — it is not income and not a new opening balance.`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3 p-4">
      <h2 className="text-base font-semibold">Add cooked portions</h2>
      <p className="text-sm text-black/60">
        Use this when a new pot is ready. The portions are counted for the till and online orders. They are not posted as an inventory gain or an opening balance.
      </p>
      <label className="block text-sm">
        Portions cooked
        <input className="input mt-1 w-32" inputMode="numeric" value={qty} onChange={(event) => setQty(event.target.value)} />
      </label>
      <label className="block text-sm">
        Note (optional)
        <input className="input mt-1" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Lunch pot" />
      </label>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
      <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Adding…' : 'Add portions'}</button>
    </form>
  );
}
