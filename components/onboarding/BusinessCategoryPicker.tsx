'use client';

import { useState, useTransition } from 'react';
import { updateBusinessCategory } from '@/app/actions/activation';
import { BUSINESS_CATEGORIES } from '@/lib/activation-steps';

const CATEGORY_LABELS: Record<string, string> = {
  SUPERMARKET: 'Supermarket',
  PROVISION: 'Provision shop',
  MINI_MART: 'Mini mart',
  PHARMACY: 'Pharmacy',
  COSMETICS: 'Cosmetics / beauty',
  HARDWARE: 'Hardware',
  WHOLESALE: 'Wholesaler',
  RESTAURANT_STOCK: 'Food business with stock',
  OTHER: 'Other product business',
};

type Props = {
  initialCategory: string | null;
  onSaved?: () => void;
};

export default function BusinessCategoryPicker({ initialCategory, onSaved }: Props) {
  const [category, setCategory] = useState(initialCategory ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateBusinessCategory(category);
      if (!result.ok) {
        setError(result.error ?? 'Could not save. Try again.');
        return;
      }
      onSaved?.();
    });
  };

  return (
    <div id="business-type" className="rounded-2xl border border-accent/20 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-ink">Choose business type</h3>
      <p className="mt-1 text-xs text-muted">This helps TillFlow match how you sell and count stock.</p>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="mt-3 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm text-ink"
        aria-label="Business type"
      >
        <option value="">Select your type of business</option>
        {BUSINESS_CATEGORIES.map((value) => (
          <option key={value} value={value}>
            {CATEGORY_LABELS[value] ?? value}
          </option>
        ))}
      </select>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending || !category}
        className="btn-primary mt-3 w-full py-2.5 text-sm disabled:opacity-50"
      >
        {isPending ? 'Saving…' : 'Save business type'}
      </button>
    </div>
  );
}
