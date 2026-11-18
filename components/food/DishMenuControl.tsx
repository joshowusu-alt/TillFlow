'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setDishOnMenuAction } from '@/app/actions/food';

export default function DishMenuControl({ id, name, removed, switchControl = false }: {
  id: string; name: string; removed: boolean; switchControl?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function update(onMenu: boolean) {
    setBusy(true);
    setError('');
    try {
      const result = await setDishOnMenuAction(id, onMenu);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setConfirm(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {switchControl ? (
        <label className="inline-flex min-h-11 items-center gap-2 font-semibold">
          <input type="checkbox" role="switch" checked={removed} disabled={busy}
            onChange={() => removed ? void update(true) : setConfirm(true)} />
          Remove from menu
        </label>
      ) : (
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void update(true)}>Put back on menu</button>
      )}
      {confirm && (
        <div role="group" aria-label="Confirm removal" className="space-y-2 rounded-xl border border-black/10 p-3">
          <p>Remove {name} from the menu? Past sales stay in your reports.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirm(false)}>Keep on menu</button>
            <button type="button" className="btn-destructive" disabled={busy} onClick={() => void update(false)}>Remove from menu</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </div>
  );
}
