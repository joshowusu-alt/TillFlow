'use client';

import { useId, useRef, useState } from 'react';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { createTillAction, deactivateTillAction } from '@/app/actions/settings';

interface Till {
  id: string;
  name: string;
  openShift?: {
    cashierName: string;
    openedAt: string;
    openingCashPence: number;
  } | null;
}

export default function TillManagement({ tills, storeId }: { tills: Till[]; storeId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState('');
  const [isPending, setPending] = useState(false);
  const nameId = useId();
  const [message, setMessage] = useState('');
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const handleCreate = async (formData: FormData) => {
    if (isPending) return;
    setError(''); setMessage(''); setPending(true);
    try {
      const result = await createTillAction(formData);
      if (result && !result.success) setError(result.error ?? 'Failed to create till.');
      else { formRef.current?.reset(); setMessage('Till added.'); }
    } catch (error) {
      if (isRedirectError(error)) throw error;
      setError('Could not add the till. Please try again.');
    }
    finally { setPending(false); }
  };
  const handleDeactivate = async (tillId: string) => {
    if (isPending) return;
    setError(''); setMessage(''); setPending(true); setDeactivatingId(tillId);
    try {
      const result = await deactivateTillAction(tillId);
      if (result && !result.success) setError(result.error ?? 'Failed to deactivate till.');
      else setMessage('Till deactivated.');
    } catch (error) {
      if (isRedirectError(error)) throw error;
      setError('Could not deactivate the till. Please try again.');
    }
    finally { setPending(false); setDeactivatingId(null); }
  };

  return (
    <div className="rounded-xl border border-black/10 bg-white/70 p-4">
      <div className="text-sm font-semibold">Till Management</div>
      <div className="mt-1 text-xs text-black/60">
        Add or deactivate tills for this store. Each till can have only one open shift at a time.
        Open and close shifts from Cash Management — this screen does not open a second shift.
      </div>

      {tills.length > 0 && (
        <ul className="mt-3 divide-y divide-black/5">
          {tills.map((till) => (
            <li key={till.id} className="flex flex-col gap-2 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 break-words">
                <span>{till.name}</span>
                {till.openShift ? (
                  <div className="text-[11px] text-black/45">
                    Open — {till.openShift.cashierName}
                    {' · '}
                    {new Date(till.openShift.openedAt).toLocaleString()}
                    {' · '}
                    float {(till.openShift.openingCashPence / 100).toFixed(2)}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="btn-ghost text-xs text-red-600 hover:text-red-700 disabled:opacity-40"
                disabled={isPending}
                aria-label={`Deactivate ${till.name}`}
                aria-busy={isPending && deactivatingId === till.id}
                onClick={() => handleDeactivate(till.id)}
              >
                {isPending && deactivatingId === till.id ? 'Removing…' : 'Deactivate'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} action={handleCreate} className="mt-3 space-y-2">
        <input type="hidden" name="storeId" value={storeId} />
        <label className="label" htmlFor={nameId}>New till name</label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id={nameId}
          disabled={isPending}
          className="input min-w-0 flex-1 text-sm"
          name="name"
          placeholder="New till name e.g. Till 3"
          maxLength={50}
          required
        />
        <button type="submit" className="btn-secondary text-xs" disabled={isPending}>
          {isPending && !deactivatingId ? 'Adding…' : 'Add till'}
        </button>
        </div>
      </form>

      {message && <p role="status" className="mt-2 text-xs text-emerald-700">{message}</p>}
      {error && <div role="alert" className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
  );
}
