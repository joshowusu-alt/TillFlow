'use client';

import { useCallback } from 'react';

import {
  getProductBaseUnitId,
  resolveBarcodeScan,
  type BarcodeScanResolution,
} from '@/lib/payments/pos-barcode';
import type { PosProductIndex } from '@/lib/pos/product-index';

type BarcodeProduct = {
  id: string;
  barcode: string | null;
  sellingPriceBasePence: number;
  units: Array<{ id: string; isBaseUnit: boolean }>;
};

type AddToCartLine = {
  productId: string;
  unitId: string;
  qtyInUnit: number;
  lineSubtotalPence?: number;
  qtyBase?: number;
  weighedLabel?: string;
  separateLine?: boolean;
};

type UsePosBarcodeHandlerOptions<TProduct extends BarcodeProduct> = {
  products: TProduct[];
  productIndex: PosProductIndex<TProduct>;
  addToCart: (line: AddToCartLine) => void;
  playBeep: (success: boolean) => void;
  onMatched?: (product: TProduct, baseUnitId: string) => void;
  onMissing: (code: string) => void;
  onWeighed?: (product: TProduct, weightGrams: number, subtotalPence: number) => void;
  lookupRemote?: (code: string) => Promise<BarcodeScanResolution<TProduct> | null>;
};

export function formatWeighedLabel(weightGrams: number): string {
  if (weightGrams >= 1000) {
    const kg = weightGrams / 1000;
    return `${kg.toFixed(kg >= 10 ? 2 : 3)} kg`;
  }
  return `${weightGrams} g`;
}

export function usePosBarcodeHandler<TProduct extends BarcodeProduct>({
  products,
  productIndex,
  addToCart,
  playBeep,
  onMatched,
  onMissing,
  onWeighed,
  lookupRemote,
}: UsePosBarcodeHandlerOptions<TProduct>) {
  const applyResolution = useCallback(
    (resolution: BarcodeScanResolution<TProduct>) => {
      if (resolution.kind === 'matched') {
        const { product, baseUnitId } = resolution;
        playBeep(true);
        addToCart({
          productId: product.id,
          unitId: baseUnitId,
          qtyInUnit: resolution.qtyInUnit ?? 1,
        });
        onMatched?.(product, baseUnitId);
        return;
      }

      if (resolution.kind === 'weighed') {
        const { product, baseUnitId, weightGrams, lineSubtotalPence, qtyBase } = resolution;
        playBeep(true);
        addToCart({
          productId: product.id,
          unitId: baseUnitId,
          qtyInUnit: 1,
          qtyBase,
          lineSubtotalPence,
          weighedLabel: formatWeighedLabel(weightGrams),
          separateLine: true,
        });
        onWeighed?.(product, weightGrams, lineSubtotalPence);
        onMatched?.(product, baseUnitId);
        return;
      }

      playBeep(false);
      onMissing(resolution.code);
    },
    [addToCart, onMatched, onMissing, onWeighed, playBeep]
  );

  const handleBarcodeScan = useCallback(
    (code: string) => {
      const resolution = resolveBarcodeScan(code, products, productIndex);
      if (!resolution) return;

      if (resolution.kind === 'missing' && lookupRemote) {
        void lookupRemote(code).then((remote) => {
          applyResolution(remote ?? resolution);
        });
        return;
      }

      applyResolution(resolution);
    },
    [applyResolution, lookupRemote, productIndex, products]
  );

  return { handleBarcodeScan, getProductBaseUnitId };
}
