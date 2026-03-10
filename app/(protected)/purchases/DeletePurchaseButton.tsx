'use client';

import { useState } from 'react';
import { deletePurchaseAction } from '@/app/actions/purchases';
import { useRouter } from 'next/navigation';

export default function DeletePurchaseButton({ purchaseId }: { purchaseId: string }) {
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm('Delete this purchase? Inventory will be reversed.')) return;
    setIsPending(true);
    try {
      const result = await deletePurchaseAction(purchaseId);
      if (!result || !result.success) {
        alert(result?.error ?? 'Could not delete this purchase. Please try again.');
      } else {
        router.refresh();
      }
    } catch {
      alert('Could not delete this purchase. Please try again.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <button
      type="button"
      className="btn-ghost text-xs text-rose-600 hover:text-rose-700"
      onClick={handleDelete}
      disabled={isPending}
    >
      {isPending ? 'Deleting…' : 'Delete'}
    </button>
  );
}
