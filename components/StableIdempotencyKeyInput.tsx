'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  clearMoneyOperationKey,
  readOrCreateMoneyOperationKey,
} from '@/lib/money/client-operation-key';

/** `scope` is `<kind>:<recordId>`; a `?paid=<recordId>` redirect marks that record's last payment as done. */
export function shouldRotateMoneyOperationKey(scope: string, paid: string | null | undefined): boolean {
  const id = paid?.trim();
  return Boolean(id) && scope.endsWith(`:${id}`);
}

/**
 * Hidden durable key that survives retries; a new identity is minted after success.
 * Success is signalled either by the `rotate` prop or by the server redirecting back with
 * `?paid=<recordId>` for this scope, so a second payment against the same expense/invoice in
 * the same tab never collides with the first one's key.
 */
export default function StableIdempotencyKeyInput({
  scope,
  rotate = false,
}: {
  scope: string;
  rotate?: boolean;
}) {
  const searchParams = useSearchParams();
  const paid = searchParams?.get('paid') ?? null;
  const shouldRotate = rotate || shouldRotateMoneyOperationKey(scope, paid);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (shouldRotate) clearMoneyOperationKey(scope);
    setIdempotencyKey((current) => readOrCreateMoneyOperationKey(scope, current));
  }, [scope, shouldRotate]);

  return <input type="hidden" name="idempotencyKey" value={idempotencyKey} />;
}
