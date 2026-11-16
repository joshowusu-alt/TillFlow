'use client';

import { useState } from 'react';
import { setFoodPurchasePhotoRequired } from '@/app/actions/quick-purchases';

export default function PurchasePhotoSwitch({ required, onChange }: { required: boolean; onChange?: (required: boolean) => void }) {
  const [checked, setChecked] = useState(required);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return <div className="space-y-2">
    <label className="flex min-h-11 items-center gap-3 font-medium">
      <input type="checkbox" role="switch" checked={checked} disabled={pending} onChange={async event => {
        const next = event.target.checked;
        setPending(true);
        setError('');
        try {
          const result = await setFoodPurchasePhotoRequired(next);
          if (result.success) {
            setChecked(next);
            onChange?.(next);
          } else setError(result.error);
        } catch {
          setError('Could not save this setting. Try again.');
        } finally {
          setPending(false);
        }
      }} />
      Require an invoice photo for every purchase
    </label>
    <p className="text-sm text-black/65">Turn on if staff must snap the supplier&apos;s receipt for every purchase.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
