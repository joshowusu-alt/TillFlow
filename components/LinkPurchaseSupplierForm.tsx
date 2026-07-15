'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { linkPurchaseSupplierAction } from '@/app/actions/purchases';
import { formatMoney } from '@/lib/format';

type SupplierOption = { id: string; name: string };

type Mode = 'existing' | 'create';

export default function LinkPurchaseSupplierForm({
  purchaseId,
  purchaseReference,
  outstandingPence,
  currency,
  itemSummary,
  suppliers,
  returnTo = '/purchases?issue=MISSING_SUPPLIER',
}: {
  purchaseId: string;
  purchaseReference: string;
  outstandingPence: number;
  currency: string;
  itemSummary: string;
  suppliers: SupplierOption[];
  returnTo?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(suppliers.length > 0 ? 'existing' : 'create');
  const [supplierId, setSupplierId] = useState('');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId]
  );

  const trimmedNewName = newSupplierName.trim();
  const duplicateMatch = useMemo(() => {
    if (!trimmedNewName) return null;
    const needle = trimmedNewName.toLowerCase();
    return (
      suppliers.find((s) => s.name.trim().toLowerCase() === needle) ??
      suppliers.find((s) => {
        const existing = s.name.trim().toLowerCase();
        return existing.includes(needle) || needle.includes(existing);
      }) ??
      null
    );
  }, [suppliers, trimmedNewName]);

  const canSubmit =
    mode === 'existing'
      ? Boolean(supplierId)
      : Boolean(trimmedNewName) && !duplicateMatch;

  const resolvedSupplierName =
    mode === 'existing' ? selectedSupplier?.name ?? '' : trimmedNewName;

  function switchMode(next: Mode) {
    setError(null);
    setMode(next);
    if (next === 'existing') {
      setNewSupplierName('');
    } else {
      setSupplierId('');
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!canSubmit || !resolvedSupplierName) {
      setError('Select a supplier or enter a new name.');
      return;
    }

    if (mode === 'create' && duplicateMatch) {
      setError(
        `"${duplicateMatch.name}" already exists. Select it from the list instead of creating a duplicate.`
      );
      return;
    }

    const confirmed = window.confirm(
      `Link ${resolvedSupplierName} to purchase ${purchaseReference}?\n\nOutstanding: ${formatMoney(
        Math.max(0, outstandingPence),
        currency
      )}`
    );
    if (!confirmed) return;

    const formData = new FormData();
    formData.set('purchaseInvoiceId', purchaseId);
    formData.set('returnTo', returnTo);
    if (mode === 'create') {
      formData.set('newSupplierName', trimmedNewName);
    } else {
      formData.set('supplierId', supplierId);
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
      {itemSummary ? (
        <p className="text-xs text-black/60">
          <span className="font-semibold text-ink">Items: </span>
          {itemSummary}
        </p>
      ) : null}

      {suppliers.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
              mode === 'existing'
                ? 'bg-accent/10 text-accent'
                : 'bg-black/5 text-black/55 hover:bg-black/10'
            }`}
            onClick={() => switchMode('existing')}
            disabled={isPending}
          >
            Existing supplier
          </button>
          <button
            type="button"
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
              mode === 'create'
                ? 'bg-accent/10 text-accent'
                : 'bg-black/5 text-black/55 hover:bg-black/10'
            }`}
            onClick={() => switchMode('create')}
            disabled={isPending}
          >
            Create a new supplier
          </button>
        </div>
      ) : null}

      {mode === 'existing' && suppliers.length > 0 ? (
        <select
          className="input text-sm"
          data-testid="link-supplier-select"
          value={supplierId}
          onChange={(e) => {
            setSupplierId(e.target.value);
            setNewSupplierName('');
            setError(null);
          }}
          disabled={isPending}
          aria-label="Select a supplier"
        >
          <option value="">Select a supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="input text-sm"
          data-testid="link-supplier-new-name"
          placeholder="New supplier name"
          value={newSupplierName}
          onChange={(e) => {
            setNewSupplierName(e.target.value);
            setSupplierId('');
            setError(null);
          }}
          disabled={isPending}
          aria-label="New supplier name"
        />
      )}

      {mode === 'create' && duplicateMatch ? (
        <p className="text-xs text-amber-700">
          A similar supplier already exists: <span className="font-semibold">{duplicateMatch.name}</span>.
          Switch to Existing supplier to link it.
        </p>
      ) : null}

      {error ? <p className="text-xs text-rose-600">{error}</p> : null}

      <button
        type="submit"
        data-testid="link-supplier-submit"
        className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isPending || !canSubmit}
      >
        {isPending ? 'Saving…' : 'Link supplier'}
      </button>
    </form>
  );
}
