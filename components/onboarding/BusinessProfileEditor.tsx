'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { updateOnboardingBusinessProfile } from '@/app/actions/onboarding';
import { BUSINESS_CATEGORIES } from '@/lib/activation-steps';
import { BUSINESS_CATEGORY_LABELS } from '@/lib/onboarding-journey';

type Props = {
  businessName: string;
  businessCategory: string | null;
  businessCategoryLabel: string | null;
  onSaved?: () => void;
  /** One-line summary (Name · Type) with quiet Edit — for completed journey rows. */
  compact?: boolean;
};

export default function BusinessProfileEditor({
  businessName,
  businessCategory,
  businessCategoryLabel,
  onSaved,
  compact = false,
}: Props) {
  const [editing, setEditing] = useState(!businessName.trim() || !businessCategory);
  const [name, setName] = useState(businessName);
  const [category, setCategory] = useState(businessCategory ?? '');
  const [displayName, setDisplayName] = useState(businessName);
  const [displayCategory, setDisplayCategory] = useState(businessCategory);
  const [displayCategoryLabel, setDisplayCategoryLabel] = useState(businessCategoryLabel);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Ignore one stale refresh after save so remounts don't reopen an empty form.
  const holdOptimisticRef = useRef(false);

  useEffect(() => {
    const nextName = businessName.trim();
    const nextCategory = businessCategory;
    if (holdOptimisticRef.current) {
      if (nextName && nextCategory) {
        holdOptimisticRef.current = false;
      } else {
        return;
      }
    }
    if (nextName) {
      setDisplayName(businessName);
      setName(businessName);
    }
    if (nextCategory) {
      setDisplayCategory(nextCategory);
      setDisplayCategoryLabel(businessCategoryLabel);
      setCategory(nextCategory);
      if (nextName) setEditing(false);
    }
  }, [businessName, businessCategory, businessCategoryLabel]);

  const savedComplete = Boolean(displayName.trim() && displayCategory);

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateOnboardingBusinessProfile({
        name,
        businessCategory: category || null,
      });
      if (!result.ok) {
        setError(result.error ?? 'Could not save.');
        return;
      }
      const trimmed = name.trim();
      holdOptimisticRef.current = true;
      setDisplayName(trimmed);
      setDisplayCategory(category || null);
      setDisplayCategoryLabel(BUSINESS_CATEGORY_LABELS[category] ?? category);
      setEditing(false);
      onSaved?.();
    });
  };

  const categoryLabel =
    displayCategoryLabel ?? BUSINESS_CATEGORY_LABELS[displayCategory ?? ''] ?? displayCategory;

  if (!editing && savedComplete) {
    if (compact) {
      return (
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm text-ink">
            <span className="font-medium">{displayName}</span>
            {categoryLabel ? <span className="text-muted"> · {categoryLabel}</span> : null}
          </p>
          <button
            type="button"
            onClick={() => {
              setName(displayName);
              setCategory(displayCategory ?? '');
              setEditing(true);
            }}
            className="shrink-0 text-xs font-medium text-black/45 underline-offset-2 hover:text-ink hover:underline"
          >
            Edit
          </button>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-black/8 bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/40">Your business</p>
            <p className="mt-1 text-sm font-semibold text-ink">{displayName}</p>
            <p className="mt-0.5 text-xs text-muted">{categoryLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setName(displayName);
              setCategory(displayCategory ?? '');
              setEditing(true);
            }}
            className="text-xs font-medium text-black/45 underline-offset-2 hover:text-ink hover:underline"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-accent/20 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-ink">Tell us about your business</h3>
      <p className="mt-1 text-xs text-muted">Kept here in setup — not buried in Settings.</p>

      <label className="mt-3 block text-xs font-medium text-ink">
        Business name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm"
          placeholder="e.g. Ama Provision Store"
          autoComplete="organization"
        />
      </label>

      <label className="mt-3 block text-xs font-medium text-ink">
        Business type
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm"
          aria-label="Business type"
        >
          <option value="">Select your type of business</option>
          {BUSINESS_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {BUSINESS_CATEGORY_LABELS[value] ?? value}
            </option>
          ))}
        </select>
      </label>

      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !name.trim() || !category}
          className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {savedComplete ? (
          <button
            type="button"
            onClick={() => {
              setName(displayName);
              setCategory(displayCategory ?? '');
              setEditing(false);
              setError(null);
            }}
            className="btn-ghost border border-black/10 px-3 text-sm"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
