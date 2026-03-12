'use client';

import { useCallback, useState } from 'react';

import { getProductBaseUnitId, type PosBarcodeProduct } from '@/lib/payments/pos-barcode';

type UseStagedProductSelectionOptions<TProduct extends PosBarcodeProduct> = {
  onAddToCart: (line: { productId: string; unitId: string; qtyInUnit: number }) => void;
};

export function useStagedProductSelection<TProduct extends PosBarcodeProduct>(
  options: UseStagedProductSelectionOptions<TProduct>
) {
  const { onAddToCart } = options;
  const [stagedProduct, setStagedProduct] = useState<TProduct | null>(null);
  const [stagedUnitId, setStagedUnitId] = useState('');
  const [stagedQty, setStagedQty] = useState('1');

  const clearStagedProduct = useCallback(() => {
    setStagedProduct(null);
    setStagedUnitId('');
    setStagedQty('1');
  }, []);

  const stageProduct = useCallback((product: TProduct) => {
    setStagedProduct(product);
    setStagedUnitId(getProductBaseUnitId(product));
    setStagedQty('1');
  }, []);

  const commitStagedProduct = useCallback(() => {
    if (!stagedProduct) return false;

    const qty = Math.max(1, Math.floor(Number(stagedQty) || 1));
    onAddToCart({
      productId: stagedProduct.id,
      unitId: stagedUnitId,
      qtyInUnit: qty,
    });
    clearStagedProduct();
    return true;
  }, [clearStagedProduct, onAddToCart, stagedProduct, stagedQty, stagedUnitId]);

  return {
    stagedProduct,
    stagedUnitId,
    setStagedUnitId,
    stagedQty,
    setStagedQty,
    stageProduct,
    clearStagedProduct,
    commitStagedProduct,
  };
}
