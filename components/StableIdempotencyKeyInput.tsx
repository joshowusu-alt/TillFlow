'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  consumeMoneyOperationKey,
  readOrCreateMoneyOperationKey,
  settleMoneyOperationKey,
} from '@/lib/money/client-operation-key';

/** `scope` is `<kind>:<recordId>`; a `?paid=<recordId>` redirect marks that record's last payment as done. */
export function shouldRotateMoneyOperationKey(scope: string, paid: string | null | undefined): boolean {
  const id = paid?.trim();
  return Boolean(id) && scope.endsWith(`:${id}`);
}

/**
 * One hidden key per payment intention.
 *
 * The same key is reused for a double-click, a refresh before submit, and a remount
 * while that submission is still unresolved. The key is retired only after the
 * success page is observed, so the next equal payment gets a new key. A refresh of
 * the same `?pay=` keeps the key minted for that success.
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
  const payNonce = searchParams?.get('pay') ?? null;
  const shouldRotate = rotate || shouldRotateMoneyOperationKey(scope, paid);
  const inputRef = useRef<HTMLInputElement>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (shouldRotate) settleMoneyOperationKey(scope, payNonce);
    setIdempotencyKey(readOrCreateMoneyOperationKey(scope, undefined, shouldRotate ? payNonce : null));
  }, [scope, shouldRotate, payNonce]);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return undefined;
    const onSubmit = () => consumeMoneyOperationKey(scope);
    form.addEventListener('submit', onSubmit);
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      if (shouldRotate) settleMoneyOperationKey(scope, payNonce);
      setIdempotencyKey(readOrCreateMoneyOperationKey(scope, undefined, shouldRotate ? payNonce : null));
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      form.removeEventListener('submit', onSubmit);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [scope, idempotencyKey, shouldRotate, payNonce]);

  return <input ref={inputRef} type="hidden" name="idempotencyKey" data-money-scope={scope} value={idempotencyKey} />;
}
