'use client';

import { useEffect } from 'react';
import { clearPurchaseDraft } from '@/lib/purchases/purchase-draft';

/** Clears a completed purchase draft once the server confirms creation. */
export default function PurchaseDraftClearer({
  storeId,
  active,
}: {
  storeId: string;
  active: boolean;
}) {
  useEffect(() => {
    if (!active || !storeId) return;
    clearPurchaseDraft(storeId);
  }, [active, storeId]);

  return null;
}
