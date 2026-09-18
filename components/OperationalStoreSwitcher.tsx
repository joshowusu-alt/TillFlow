'use client';

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
        onChange={(event) => {
          const nextId = event.currentTarget.value;
          const nextName = stores.find((store) => store.id === nextId)?.name ?? nextId;
          if (nextId) publishOperationalStoreSignal({ id: nextId, name: nextName });
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
    </form>
  );
}
