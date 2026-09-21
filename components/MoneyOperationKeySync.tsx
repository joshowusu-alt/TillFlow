'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { consumeMoneyOperationKeysForRecord } from '@/lib/money/client-operation-key';

/**
 * Retires the idempotency key for `?paid=<recordId>` on whatever page the payment
 * returned to, including `/suppliers/<id>`, which does not render the payment form.
 * A new `?pay=` value (each successful payment) runs this again.
 */
export default function MoneyOperationKeySync() {
  const params = useSearchParams();
  const paid = params?.get('paid') ?? '';
  const pay = params?.get('pay') ?? '';

  useEffect(() => {
    if (paid) consumeMoneyOperationKeysForRecord(paid, pay);
  }, [paid, pay]);

  return null;
}
