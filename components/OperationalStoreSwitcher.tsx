'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  switchOperationalStoreAction,
  switchOperationalStoreResultAction,
} from '@/app/actions/operational-store';
import { publishOperationalStoreSignal } from '@/lib/reliability/operational-store-sync';

export type OperationalStoreOption = {
  id: string;
  name: string;
};

export const SWITCH_NETWORK_FAILURE_MSG =
  'The branch switch did not reach the server. Your previous branch is still active — retry, or reselect a branch.';

/** Message shown under the switching dialog for a failed attempt (network or server rejection). */
export function describeSwitchFailure(error: unknown): string {
  if (error && typeof error === 'object' && 'error' in error && typeof (error as { error: unknown }).error === 'string') {
    return (error as { error: string }).error;
  }
  return SWITCH_NETWORK_FAILURE_MSG;
}

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
  const [failure, setFailure] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // The dialog clears only when the server-authoritative branch equals the
  // intended one (the cookie has landed and the shell re-rendered) — never on
  // a timer, so a slow or failed switch cannot fail open.
  useEffect(() => {
    if (pending && selectedStoreId === pending.id) {
      setPending((current) => (current && current.id === selectedStoreId ? null : current));
      setFailure(null);
      setInFlight(false);
    }
  }, [pending, selectedStoreId]);

  useEffect(() => {
    if (!pending) return undefined;
    // Submit only after the hidden `storeId` field has rendered with the
    // intended branch; submitting inside onChange would send the old value.
    formRef.current?.requestSubmit();
    const block = (event: Event) => {
      if (event.type === 'keydown') {
        const key = (event as KeyboardEvent).key;
        if (key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          dialogRef.current?.focus();
          return;
        }
        if (key !== 'Enter' && key !== 'NumpadEnter' && key !== ' ') return;
      }
      const target = event.target;
      if (target instanceof Element && target.closest('[data-switching-operational-store]')) return;
      if (event.type === 'submit' && target === formRef.current) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener('submit', block, true);
    document.addEventListener('click', block, true);
    document.addEventListener('keydown', block, true);
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('submit', block, true);
      document.removeEventListener('click', block, true);
      document.removeEventListener('keydown', block, true);
    };
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
    <form
      ref={formRef}
      action={switchOperationalStoreAction}
      className="inline-flex items-center"
      onSubmit={(event) => {
        // With JS available the switch runs through the result action so a
        // network failure or server rejection stays inside this dialog (Retry
        // keeps the intended branch) instead of unmounting the shell into the
        // route error boundary. The `action` prop remains the no-JS fallback.
        event.preventDefault();
        if (inFlight) return;
        const form = event.currentTarget;
        const formData = new FormData(form);
        setInFlight(true);
        setFailure(null);
        void switchOperationalStoreResultAction(formData)
          .then((result) => {
            if (result && !result.success) setFailure(describeSwitchFailure(result));
          })
          .catch((error: unknown) => {
            setFailure(describeSwitchFailure(error));
          })
          .finally(() => {
            setInFlight(false);
          });
      }}
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className="sr-only" htmlFor="operational-store-switcher">
        Active branch
      </label>
      {/*
        The visible select is controlled by the server-authoritative branch so the
        header never shows the new branch before the cookie has landed. The chosen
        branch travels in the hidden `storeId` field only.
      */}
      <select
        id="operational-store-switcher"
        className="h-9 max-w-[13rem] truncate rounded-xl border border-slate-200/80 bg-white/90 px-2 text-xs font-semibold text-ink shadow-sm"
        value={selectedStoreId ?? ''}
        data-operational-store={selectedStoreId ?? ''}
        aria-busy={Boolean(pending)}
        disabled={Boolean(pending)}
        onChange={(event) => {
          const nextId = event.currentTarget.value;
          if (!nextId || nextId === selectedStoreId) return;
          const nextName = stores.find((store) => store.id === nextId)?.name ?? nextId;
          setPending({ id: nextId, name: nextName });
          publishOperationalStoreSignal({ id: nextId, name: nextName });
        }}
      >
        {!selectedStoreId ? <option value="">Select branch</option> : null}
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </select>
      <input type="hidden" name="storeId" value={pending?.id ?? selectedStoreId ?? ''} />
      {pending ? <input type="hidden" name="intendedStoreId" value={pending.id} /> : null}
      {pending ? (
        <div
          ref={dialogRef}
          data-switching-operational-store
          role="alertdialog"
          aria-modal="true"
          aria-live="assertive"
          aria-label={`Switching to ${pending.name}`}
          tabIndex={-1}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-xl">
            <p className="text-sm font-semibold text-ink">Switching to {pending.name}</p>
            <p className="mt-2 text-sm leading-5 text-black/60">
              Wait until this branch is active before selling or recording money.
            </p>
            {failure ? (
              <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm leading-5 text-rose-700" role="alert" data-switch-failure>
                {failure}
              </p>
            ) : null}
            <button
              type="button"
              className="btn-secondary mt-4 text-sm"
              disabled={inFlight}
              onClick={() => formRef.current?.requestSubmit()}
            >
              Retry switch
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
