'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deactivateUnusedCatalogueProductAction } from '@/app/actions/products';

/** Deactivate from unused-catalogue issue queue with server-side eligibility recheck. */
export default function DeactivateProductIssueButton({
  productId,
  productName,
  returnTo,
}: {
  productId: string;
  productName: string;
  returnTo: string;
}) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Deactivate "${productName}"? It will be hidden from the POS and this review list.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const result = await deactivateUnusedCatalogueProductAction(productId);
      if (result.success) {
        router.push(returnTo);
        router.refresh();
      } else {
        alert(result.error);
        router.refresh();
      }
    } catch {
      alert('Failed to deactivate product.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="btn-ghost text-xs text-rose-700 hover:text-rose-800"
    >
      {deleting ? 'Deactivating…' : 'Deactivate'}
    </button>
  );
}
