import { formatMoney } from '@/lib/format';

type Props = { currency: string; totalDue: number; changeDue: number; hasCash: boolean; balanceRemaining: number };

/** Kept beside the completion action, outside scrollable payment fields. */
export default function PosPaymentSummary({ currency, totalDue, changeDue, hasCash, balanceRemaining }: Props) {
  return <div className="space-y-2" data-pos-payment-summary="true" aria-live="polite" aria-atomic="true">
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-lg font-bold text-slate-950"><span>Total</span><span className="tabular-nums">{formatMoney(totalDue, currency)}</span></div>
    {balanceRemaining > 0 ? <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 font-semibold text-amber-950"><span>Still to pay</span><span className="tabular-nums">{formatMoney(balanceRemaining, currency)}</span></div> : null}
    {hasCash ? <div className="rounded-xl border-2 border-emerald-700 bg-emerald-50 px-3 py-2 text-emerald-950" data-pos-change-due="true"><div className="text-sm font-bold">Change to give</div><div className="break-words text-3xl font-extrabold leading-tight tabular-nums">{formatMoney(Math.max(0, changeDue), currency)}</div></div> : null}
  </div>;
}
