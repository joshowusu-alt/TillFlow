import { formatMoney } from '@/lib/format';

type RemainingBalanceProps = {
  amountPence: number;
  paidPence: number;
  currency: string;
  className?: string;
};

export default function RemainingBalance({
  amountPence,
  paidPence,
  currency,
  className = '',
}: RemainingBalanceProps) {
  const remaining = amountPence - paidPence;
  return (
    <dl className={`grid grid-cols-3 gap-2 text-sm ${className}`}>
      <div>
        <dt className="text-xs text-black/50">Original</dt>
        <dd className="font-semibold tabular-nums">{formatMoney(amountPence, currency)}</dd>
      </div>
      <div>
        <dt className="text-xs text-black/50">Paid</dt>
        <dd className="font-semibold tabular-nums">{formatMoney(paidPence, currency)}</dd>
      </div>
      <div>
        <dt className="text-xs text-black/50">Remaining</dt>
        <dd className="font-semibold tabular-nums text-ink">{formatMoney(remaining, currency)}</dd>
      </div>
    </dl>
  );
}
