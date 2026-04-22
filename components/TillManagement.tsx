'use client';

import { useRef, useState, useTransition } from 'react';
import { createTillAction, deactivateTillAction } from '@/app/actions/settings';

interface Till {
  id: string;
  name: string;
}

export default function TillManagement({ tills }: { tills: Till[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const handleCreate = (formData: FormData) => {
    setError('');
    startTransition(async () => {
      const result = await createTillAction(formData);
      if (result && !result.success) {
        setError(result.error ?? 'Failed to create till.');
      } else {
        formRef.current?.reset();
      }
    });
  };

  const handleDeactivate = (tillId: string) => {
    setDeactivatingId(tillId);
    startTransition(async () => {
      const result = await deactivateTillAction(tillId);
      setDeactivatingId(null);
      if (result && !result.success) {
        setError(result.error ?? 'Failed to deactivate till.');
      }
    });
  };

  return (
    <div className="rounded-xl border border-black/10 bg-white/70 p-4">
      <div className="text-sm font-semibold">Till Management</div>
      <div className="mt-1 text-xs text-black/60">
        Add or deactivate tills for this store. Each till can run an independent shift.
      </div>

      {tills.length > 0 && (
        <ul className="mt-3 divide-y divide-black/5">
          {tills.map((till) => (
            <li key={till.id} className="flex items-center justify-between py-2 text-sm">
              <span>{till.name}</span>
              <button
                type="button"
                className="btn-ghost text-xs text-red-600 hover:text-red-700 disabled:opacity-40"
                disabled={isPending && deactivatingId === till.id}
                onClick={() => handleDeactivate(till.id)}
              >
                {isPending && deactivatingId === till.id ? 'Removing…' : 'Deactivate'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} action={handleCreate} className="mt-3 flex items-center gap-2">
        <input
          className="input flex-1 text-sm"
          name="name"
          placeholder="New till name e.g. Till 3"
          maxLength={50}
          required
        />
        <button type="submit" className="btn-secondary text-xs" disabled={isPending}>
          {isPending && !deactivatingId ? 'Adding…' : 'Add till'}
        </button>
      </form>

      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
  );
}
