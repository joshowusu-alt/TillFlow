'use client';

import { useEffect, useState } from 'react';
import {
  OPERATIONAL_STORE_CHANNEL,
  OPERATIONAL_STORE_SIGNAL_KEY,
  isStaleOperationalStore,
  parseOperationalStoreSignal,
  type OperationalStoreSignal,
} from '@/lib/reliability/operational-store-sync';
import { STALE_OPERATIONAL_STORE_MSG } from '@/lib/reliability/operational-store';
import { setStaleOperationalStoreBlocked } from '@/lib/reliability/stale-operational-store-client';

function isInsideGuard(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-stale-operational-store-guard]'));
}

function isInteractiveMutationTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'form, button, [type="submit"], [formaction], [data-close-shift], [data-stale-mutation]',
    ),
  );
}

export default function StaleOperationalStoreGuard({
  storeId,
  storeName,
}: {
  storeId?: string | null;
  storeName?: string | null;
}) {
  const [signal, setSignal] = useState<OperationalStoreSignal | null>(null);
  const [loadedAt] = useState(() => Date.now());

  useEffect(() => {
    const apply = (next: OperationalStoreSignal | null) => {
      if (next) setSignal(next);
    };
    apply(parseOperationalStoreSignal(window.localStorage.getItem(OPERATIONAL_STORE_SIGNAL_KEY)));
    const onStorage = (event: StorageEvent) => {
      if (event.key === OPERATIONAL_STORE_SIGNAL_KEY) {
        apply(parseOperationalStoreSignal(event.newValue));
      }
    };
    const channel = new BroadcastChannel(OPERATIONAL_STORE_CHANNEL);
    channel.onmessage = (event) => apply(event.data as OperationalStoreSignal);
    window.addEventListener('storage', onStorage);
    return () => {
      channel.close();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const stale = isStaleOperationalStore(storeId, signal, loadedAt) && Boolean(signal);

  useEffect(() => {
    setStaleOperationalStoreBlocked(stale);
    if (!stale) return;
    const block = (event: Event) => {
      // The overlay's own "Reload this tab" control must stay usable.
      if (isInsideGuard(event.target)) return;
      if (event.type === 'keydown') {
        const key = (event as KeyboardEvent).key;
        if (key !== 'Enter' && key !== 'NumpadEnter') return;
      }
      if (event.type === 'click' && !isInteractiveMutationTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener('submit', block, true);
    document.addEventListener('click', block, true);
    document.addEventListener('keydown', block, true);
    return () => {
      setStaleOperationalStoreBlocked(false);
      document.removeEventListener('submit', block, true);
      document.removeEventListener('click', block, true);
      document.removeEventListener('keydown', block, true);
    };
  }, [stale]);

  if (!stale || !signal) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
      data-stale-operational-store={signal.id}
      data-stale-operational-store-guard=""
      role="alertdialog"
      aria-labelledby="stale-operational-store-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="stale-operational-store-title" className="text-lg font-display font-semibold text-ink">
          Branch changed in another tab
        </h2>
        <p className="mt-2 text-sm text-black/70">{STALE_OPERATIONAL_STORE_MSG}</p>
        <p className="mt-2 text-sm text-black/70">
          This tab still shows {storeName || 'no selected branch'}. The active branch is now{' '}
          <span className="font-semibold">{signal.name}</span>. Nothing will be recorded from this tab
          until you reload.
        </p>
        <button
          type="button"
          className="btn-primary mt-4 w-full"
          onClick={() => window.location.reload()}
        >
          Reload this tab
        </button>
      </div>
    </div>
  );
}
