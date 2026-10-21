import { formatMoney } from '@/lib/format';

type Props = { subtotal?: number; discount?: number; tax?: number; currency: string; totalDue: number; changeDue: number; hasCash: boolean; balanceRemaining: number };

/** Kept beside the completion action, outside scrollable payment fields. */
export default function PosPaymentSummary({ currency, subtotal, discount = 0, tax = 0, totalDue, changeDue, hasCash, balanceRemaining }: Props) {
  return <div className="space-y-2" data-pos-payment-summary="true" aria-live="polite" aria-atomic="true">
    {discount > 0 || tax > 0 ? <div className="space-y-1 text-sm text-slate-700" data-pos-total-breakdown="true"><div className="flex justify-between gap-2"><span>Items subtotal</span><span className="tabular-nums">{formatMoney(subtotal ?? totalDue + discount - tax, currency)}</span></div>{discount > 0 ? <div className="flex justify-between gap-2"><span>Order discount</span><span className="tabular-nums">−{formatMoney(discount, currency)}</span></div> : null}{tax > 0 ? <div className="flex justify-between gap-2"><span>VAT</span><span className="tabular-nums">{formatMoney(tax, currency)}</span></div> : null}</div> : null}
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-lg font-bold text-slate-950"><span>Total</span><span className="tabular-nums">{formatMoney(totalDue, currency)}</span></div>
    {balanceRemaining > 0 ? <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 font-semibold text-amber-950"><span>Still to pay</span><span className="tabular-nums">{formatMoney(balanceRemaining, currency)}</span></div> : null}
    {hasCash ? <div className="rounded-xl border-2 border-emerald-700 bg-emerald-50 px-3 py-2 text-emerald-950" data-pos-change-due="true"><div className="text-sm font-bold">Change to give</div><div className="break-words text-3xl font-extrabold leading-tight tabular-nums">{formatMoney(Math.max(0, changeDue), currency)}</div></div> : null}
  </div>;
}
