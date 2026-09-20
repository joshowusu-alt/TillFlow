'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { switchOperationalStoreAction } from '@/app/actions/operational-store';
import { publishOperationalStoreSignal } from '@/lib/reliability/operational-store-sync';

export type OperationalStoreOption = {
  id: string;
  name: string;
};

export default function OperationalStoreSwitcher({
  stores,
  selectedStoreId,
  selectedStoreName,
  canSwitch,
}: {
  stores: OperationalStoreOption[];
  selectedStoreId?: string | null;
  selectedStoreName?: string | null;
  canSwitch: boolean;
}) {
  const pathname = usePathname() ?? '/onboarding';
  const searchParams = useSearchParams();
  const currentQuery = searchParams?.toString();
  const returnTo = currentQuery ? `${pathname}?${currentQuery}` : pathname;
  const label = selectedStoreName?.trim() || (stores.length > 1 ? 'Select branch' : 'No branch');
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!pending) return undefined;
    const timeout = window.setTimeout(() => setPending(null), 12_000);
    return () => window.clearTimeout(timeout);
  }, [pending]);

  if (!canSwitch || stores.length <= 1) {
    return (
      <span
        className="inline-flex h-9 max-w-[12rem] items-center truncate rounded-xl border border-slate-200/80 bg-white/90 px-2.5 text-xs font-semibold text-ink shadow-sm"
        title={label}
        data-operational-store={selectedStoreId ?? ''}
      >
        {label}
      </span>
    );
  }

  return (
    <form action={switchOperationalStoreAction} className="inline-flex items-center">
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className="sr-only" htmlFor="operational-store-switcher">
        Active branch
      </label>
      <select
        id="operational-store-switcher"
        name="storeId"
        className="h-9 max-w-[13rem] truncate rounded-xl border border-slate-200/80 bg-white/90 px-2 text-xs font-semibold text-ink shadow-sm"
        defaultValue={selectedStoreId ?? ''}
        data-operational-store={selectedStoreId ?? ''}
        aria-busy={Boolean(pending)}
        onChange={(event) => {
          const nextId = event.currentTarget.value;
          const nextName = stores.find((store) => store.id === nextId)?.name ?? nextId;
          if (nextId) {
            setPending({ id: nextId, name: nextName });
            publishOperationalStoreSignal({ id: nextId, name: nextName });
          }
          event.currentTarget.form?.requestSubmit();
        }}
      >
        {!selectedStoreId ? <option value="">Select branch</option> : null}
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </select>
      {pending ? <input type="hidden" name="storeId" value={pending.id} /> : null}
      {pending ? (
        <div
          data-switching-operational-store
          role="alertdialog"
          aria-live="assertive"
          aria-label={`Switching to ${pending.name}`}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-xl">
            <p className="text-sm font-semibold text-ink">Switching to {pending.name}</p>
            <p className="mt-2 text-sm leading-5 text-black/60">
              Wait until this branch is active before selling or recording money.
            </p>
          </div>
        </div>
      ) : null}
    </form>
  );
}
