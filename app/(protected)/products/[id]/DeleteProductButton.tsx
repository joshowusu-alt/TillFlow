'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteProductAction } from '@/app/actions/products';

export default function DeleteProductButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to deactivate "${productName}"? It will be hidden from the POS and product list.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const result = await deleteProductAction(productId);
      if (result.success) {
        router.push('/products');
      } else {
        alert(result.error);
      }
    } catch {
      alert('Failed to deactivate product.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="btn mt-4 bg-rose-600 text-white hover:bg-rose-700"
    >
      {deleting ? 'Deactivating...' : 'Deactivate Product'}
    </button>
  );
}
