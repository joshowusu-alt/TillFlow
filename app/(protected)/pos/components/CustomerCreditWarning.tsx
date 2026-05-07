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
      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
    >
      <div className="font-semibold">Credit limit will be exceeded</div>
      <div className="mt-0.5 text-amber-800">
        Outstanding {formatMoney(balance.outstandingBalancePence, currency)} + this sale{' '}
        {formatMoney(totalDuePence, currency)} ={' '}
        <span className="font-semibold">{formatMoney(projected, currency)}</span>, which is{' '}
        <span className="font-semibold">{formatMoney(overshoot, currency)}</span> over their{' '}
        {formatMoney(balance.creditLimitPence, currency)} limit.
      </div>
    </div>
  );
}
