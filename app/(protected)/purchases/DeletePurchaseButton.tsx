'use client';

import { useTransition } from 'react';
import { deletePurchaseAction } from '@/app/actions/purchases';
import { useRouter } from 'next/navigation';

export default function DeletePurchaseButton({ purchaseId }: { purchaseId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleDelete = () => {
    if (!confirm('Delete this purchase? Inventory will be reversed.')) return;
    startTransition(async () => {
      const result = await deletePurchaseAction(purchaseId);
      if (!result.success) {
        alert(result.error);
      } else {
        router.refresh();
      }
    });
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
