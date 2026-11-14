'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { writeOffCookedPortionsAction } from '@/app/actions/food';
import { LEFTOVER_REASON_CODES, LEFTOVER_REASON_LABELS, type LeftoverReasonCode } from '@/lib/food/leftover-write-off';
import { formatMoney } from '@/lib/format';

export default function LeftoverWriteOffForm({
  productId,
  storeId,
  costPerPortionPence,
  currency,
}: {
  productId: string;
  storeId: string;
  costPerPortionPence: number | null;
  currency: string;
}) {
  const router = useRouter();
  const [manualCost, setManualCost] = useState('');
  const [qty, setQty] = useState('1');
  const [reasonCode, setReasonCode] = useState<LeftoverReasonCode>('END_OF_DAY_LEFTOVER');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const portions = Math.max(0, Math.floor(Number(qty) || 0));
  const manualCostPence = manualCost === '' ? undefined : Math.round(Number(manualCost) * 100);
  const valuePence = (costPerPortionPence ?? manualCostPence ?? 0) * portions;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await writeOffCookedPortionsAction({
      productId,
      storeId,
      manualCostPence,
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
        ? `Wrote off ${result.data.qty} portions. ${formatMoney(result.data.valuePence, currency)} moved from Food costs to Food waste.`
        : `Wrote off ${result.data.qty} portions. Record ingredients used first to cost this waste.`,
    );
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3 p-4">
      <h2 className="text-base font-semibold">Throw away cooked portions</h2>
      <p className="text-sm text-black/60">
        {costPerPortionPence != null
          ? `Latest batch cost: ${formatMoney(costPerPortionPence, currency)} per portion.`
          : 'Enter the cost per portion if you already recorded the ingredients used.'}
      </p>
      {costPerPortionPence == null && <label className="block text-sm">
        Cost per portion ({currency})
        <input className="input mt-1 w-32" type="number" min="0" step="0.01" value={manualCost} onChange={event => setManualCost(event.target.value)} />
      </label>}
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
        {valuePence > 0 ? `Estimated waste cost: ${formatMoney(valuePence, currency)}.` : 'The portion count will go down when you save.'}
      </p>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
      <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Write off portions'}</button>
    </form>
  );
}
