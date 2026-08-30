'use client';

import { useEffect, useState } from 'react';
import {
  clearMoneyOperationKey,
  readOrCreateMoneyOperationKey,
} from '@/lib/money/client-operation-key';

/** Hidden durable key that survives retries; `rotate` mints a new identity after success. */
export default function StableIdempotencyKeyInput({
  scope,
  rotate = false,
}: {
  scope: string;
  rotate?: boolean;
}) {
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (rotate) clearMoneyOperationKey(scope);
    setIdempotencyKey((current) => readOrCreateMoneyOperationKey(scope, current));
  }, [scope, rotate]);

  return <input type="hidden" name="idempotencyKey" value={idempotencyKey} />;
}
