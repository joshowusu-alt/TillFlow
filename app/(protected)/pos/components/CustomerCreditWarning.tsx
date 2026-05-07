'use client';

import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@/lib/format';

type Props = {
  customerId: string;
  totalDuePence: number;
  currency: string;
};

type BalanceResponse = {
  customerId: string;
  creditLimitPence: number;
  outstandingBalancePence: number;
};

/**
 * Non-blocking warning shown next to the customer selector at POS when the
 * current cart, added to the customer's outstanding balance, would exceed
 * their stored credit limit. Stays quiet when no customer is selected, when
 * the customer has no credit limit (== 0), or when the projected balance is
 * still within the limit.
 */
export default function CustomerCreditWarning({ customerId, totalDuePence, currency }: Props) {
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const lastFetchedId = useRef<string | null>(null);

  useEffect(() => {
    if (!customerId) {
      setBalance(null);
      lastFetchedId.current = null;
      return;
    }
    if (lastFetchedId.current === customerId) return;

    let cancelled = false;
    setLoading(true);
    fetch(`/api/customers/${encodeURIComponent(customerId)}/balance`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: BalanceResponse | null) => {
        if (cancelled) return;
        if (data && data.customerId === customerId) {
          setBalance(data);
          lastFetchedId.current = customerId;
        } else {
          setBalance(null);
        }
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (!customerId || !balance || loading) return null;
  if (balance.creditLimitPence <= 0) return null;

  const projected = balance.outstandingBalancePence + Math.max(0, totalDuePence);
  const overshoot = projected - balance.creditLimitPence;
  if (overshoot <= 0) return null;

  return (
    <div
      role="status"
      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">Credit limit will be exceeded</span>
        <span className="shrink-0 font-semibold tabular-nums">
          {formatMoney(overshoot, currency)} over
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-amber-800 sm:grid-cols-3">
        <div className="flex flex-col">
          <dt className="text-[10px] uppercase tracking-wide opacity-70">Outstanding</dt>
          <dd className="tabular-nums">{formatMoney(balance.outstandingBalancePence, currency)}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-[10px] uppercase tracking-wide opacity-70">This sale</dt>
          <dd className="tabular-nums">{formatMoney(totalDuePence, currency)}</dd>
        </div>
        <div className="flex flex-col col-span-2 sm:col-span-1">
          <dt className="text-[10px] uppercase tracking-wide opacity-70">Limit</dt>
          <dd className="tabular-nums">
            {formatMoney(projected, currency)}{' '}
            <span className="opacity-70">/ {formatMoney(balance.creditLimitPence, currency)}</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
