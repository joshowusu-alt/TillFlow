'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { writeOffCookedPortionsAction } from '@/app/actions/food';
import { LEFTOVER_REASON_CODES, LEFTOVER_REASON_LABELS, type LeftoverReasonCode } from '@/lib/food/leftover-write-off';
import { formatMoney } from '@/lib/format';

export default function LeftoverWriteOffForm({
  productId,
  costPerPortionPence,
  currency,
}: {
  productId: string;
  costPerPortionPence: number | null;
  currency: string;
}) {
  const router = useRouter();
  const [qty, setQty] = useState('1');
  const [reasonCode, setReasonCode] = useState<LeftoverReasonCode>('END_OF_DAY_LEFTOVER');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const portions = Math.max(0, Math.floor(Number(qty) || 0));
  const valuePence = (costPerPortionPence ?? 0) * portions;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await writeOffCookedPortionsAction({
      productId,
      qty: portions,
      reasonCode,
      note,
      idempotencyKey: crypto.randomUUID(),
    });
    setPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setMessage(
      result.data.valuePence > 0
        ? `Wrote off ${result.data.qty} portions. ${formatMoney(result.data.valuePence, currency)} posted to inventory loss.`
        : `Wrote off ${result.data.qty} portions. No cost was set, so no money was posted.`,
    );
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3 p-4">
      <h2 className="text-base font-semibold">Throw away cooked portions</h2>
      <p className="text-sm text-black/60">
        {costPerPortionPence && costPerPortionPence > 0
          ? `Each portion is costed at ${formatMoney(costPerPortionPence, currency)}. That amount is posted to inventory loss, the same way as other stock written off.`
          : 'No cost per portion is set, so this only reduces the count. Nothing is posted to the books.'}
      </p>
      <label className="block text-sm">
        Portions thrown away
        <input className="input mt-1 w-32" inputMode="numeric" value={qty} onChange={(event) => setQty(event.target.value)} />
      </label>
      <label className="block text-sm">
        Reason
        <select className="input mt-1" value={reasonCode} onChange={(event) => setReasonCode(event.target.value as LeftoverReasonCode)}>
          {LEFTOVER_REASON_CODES.map((code) => (
            <option key={code} value={code}>{LEFTOVER_REASON_LABELS[code]}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Note (optional)
        <input className="input mt-1" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Left after dinner" />
      </label>
      <p className="text-sm text-black/70">
        {valuePence > 0 ? `This write-off will post ${formatMoney(valuePence, currency)}.` : 'This write-off will post GH₵0.00.'}
      </p>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
      <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Write off portions'}</button>
    </form>
  );
}
