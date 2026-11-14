'use client';

import { useState } from 'react';
import { markRecipeIngredientsNotSoldAction } from '@/app/actions/food';

export default function MarkRecipeIngredientsButton({ productId, names }: { productId: string; names: string[] }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (names.length === 0) return null;

  return (
    <section className="space-y-2 rounded-2xl border border-border p-4">
      <p className="text-sm">These recipe ingredients are still available for sale: {names.join(', ')}.</p>
      <button className="btn-secondary" type="button" disabled={pending} onClick={async () => {
        setError('');
        setPending(true);
        try {
          const result = await markRecipeIngredientsNotSoldAction(productId);
          if (!result.success) setError(result.error);
        } catch {
          setError('Could not mark the ingredients. Try again.');
        } finally {
          setPending(false);
        }
      }}>Mark these as ingredients (not sold)</button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
