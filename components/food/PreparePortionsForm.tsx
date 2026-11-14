'use client';

import { useState } from 'react';
import { formatMoney } from '@/lib/format';
import { useRouter } from 'next/navigation';
import { addPreparedPortionsAction } from '@/app/actions/food';

export default function PreparePortionsForm({ productId, storeId, currency, sizes }: {
  productId: string; storeId: string; currency: string; sizes: { id: string; name: string; isDefault: boolean }[];
}) {
  const router = useRouter();
  const [sizeId, setSizeId] = useState(sizes.find(size => size.isDefault)?.id ?? sizes[0]?.id);
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
      storeId,
      sizeId,
      qty: Number(qty),
      note,
      idempotencyKey: crypto.randomUUID(),
    });
    setPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    const cost = result.data.costPerPortionPence;
    setMessage(cost == null ? `Added ${result.data.qty} portions. Use Ingredients used to record the stock cost.`
      : `Added ${result.data.qty} portions. Ingredient cost per portion: ${formatMoney(cost, currency)}.`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3 p-4">
      <h2 className="text-base font-semibold">Add cooked portions</h2>
      <p className="text-sm text-black/60">
        Add a batch when it is ready. A saved recipe takes ingredients out of stock and records their cost.
      </p>
      {sizes.length > 0 && <label className="block text-sm">
        Size cooked
        <select className="input mt-1" value={sizeId} onChange={event => setSizeId(event.target.value)}>
          {sizes.map(size => <option key={size.id} value={size.id}>{size.name}</option>)}
        </select>
      </label>}
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
