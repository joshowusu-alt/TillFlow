'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { linkPurchaseSupplierAction } from '@/app/actions/purchases';

type SupplierOption = { id: string; name: string };

export default function LinkPurchaseSupplierForm({
  purchaseId,
  suppliers,
  returnTo = '/purchases?issue=MISSING_SUPPLIER',
}: {
  purchaseId: string;
  suppliers: SupplierOption[];
  returnTo?: string;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set('purchaseInvoiceId', purchaseId);
    formData.set('returnTo', returnTo);
    if (newSupplierName.trim()) {
      formData.set('newSupplierName', newSupplierName.trim());
    } else if (supplierId) {
      formData.set('supplierId', supplierId);
    } else {
      setError('Select a supplier or enter a new name.');
      return;
    }

    startTransition(async () => {
      const result = await linkPurchaseSupplierAction(formData);
      if (!result.success) {
        setError(result.error || 'Could not link supplier.');
        return;
      }
      router.refresh();
      router.push(result.data.redirectTo);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full min-w-0 flex-col gap-2 sm:max-w-md">
      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
        Link supplier
      </label>
      {suppliers.length > 0 ? (
        <select
          className="input text-sm"
          value={supplierId}
          onChange={(e) => {
            setSupplierId(e.target.value);
            setNewSupplierName('');
          }}
          disabled={isPending || Boolean(newSupplierName.trim())}
        >
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : null}
      <input
        className="input text-sm"
        placeholder={suppliers.length > 0 ? 'Or create a new supplier…' : 'New supplier name'}
        value={newSupplierName}
        onChange={(e) => setNewSupplierName(e.target.value)}
        disabled={isPending}
      />
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      <button type="submit" className="btn-primary text-xs" disabled={isPending}>
        {isPending ? 'Saving…' : 'Link supplier'}
      </button>
    </form>
  );
}
