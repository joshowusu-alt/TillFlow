'use client';

import { useTransition } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { switchOperationalStoreAction } from '@/app/actions/operational-store';

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
  const [pending, startTransition] = useTransition();
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
    <form
      action={(formData) => {
        startTransition(() => {
          void switchOperationalStoreAction(formData).then(() => undefined);
        });
      }}
      className="inline-flex items-center"
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className="sr-only" htmlFor="operational-store-switcher">
        Active branch
      </label>
      <select
        id="operational-store-switcher"
        name="storeId"
        className="h-9 max-w-[13rem] truncate rounded-xl border border-slate-200/80 bg-white/90 px-2 text-xs font-semibold text-ink shadow-sm"
        defaultValue={selectedStoreId ?? ''}
        disabled={pending}
        data-operational-store={selectedStoreId ?? ''}
        onChange={(event) => {
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
