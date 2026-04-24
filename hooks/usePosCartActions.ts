'use client';

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import type { PosDiscountType } from '@/lib/payments/pos-checkout';
import type { PosCartLine } from '@/lib/payments/pos-cart';

type CartLineInput = {
  productId: string;
  unitId: string;
  qtyInUnit: number;
};

type UsePosCartActionsOptions<TCartLine extends PosCartLine> = {
  cart: TCartLine[];
  setCart: Dispatch<SetStateAction<TCartLine[]>>;
  pushUndo: (cart: TCartLine[]) => void;
  clampQtyInUnit: (
    productId: string,
    unitId: string,
    desiredQty: number,
    excludeLineId?: string
  ) => number;
  onFirstCartLine?: () => void;
};

export function usePosCartActions<TCartLine extends PosCartLine>({
  cart,
  setCart,
  pushUndo,
  clampQtyInUnit,
  onFirstCartLine,
}: UsePosCartActionsOptions<TCartLine>) {
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  const clearQtyDraft = useCallback((lineId: string) => {
    setQtyDrafts((prev) => {
      if (!prev[lineId]) return prev;
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
  }, []);

  const removeLine = useCallback((lineId: string) => {
    pushUndo(cart);
    setCart((prev) => prev.filter((item) => item.id !== lineId));
    clearQtyDraft(lineId);
    if (activeLineId === lineId) {
      setActiveLineId(null);
    }
  }, [activeLineId, cart, clearQtyDraft, pushUndo, setCart]);

  const addToCart = useCallback((line: CartLineInput) => {
    if (!line.productId || !line.unitId || line.qtyInUnit <= 0) return;
    if (cart.length === 0) onFirstCartLine?.();

    const id = `${line.productId}:${line.unitId}`;
    const existing = cart.find((item) => item.id === id);
    const desiredQty = (existing?.qtyInUnit ?? 0) + line.qtyInUnit;
    const clampedQty = clampQtyInUnit(line.productId, line.unitId, desiredQty, existing?.id);
    if (clampedQty <= 0) return;

    setCart((prev) => {
      if (existing) {
        return prev.map((item) => (item.id === id ? { ...item, qtyInUnit: clampedQty } : item));
      }
      return [
        ...prev,
        { id, ...line, qtyInUnit: clampedQty, discountType: 'NONE', discountValue: '' } as TCartLine,
      ];
    });
  }, [cart, clampQtyInUnit, onFirstCartLine, setCart]);

  const commitLineQty = useCallback((line: TCartLine) => {
    const draft = qtyDrafts[line.id];
    if (draft === undefined) return;

    const trimmed = draft.trim();
    if (!trimmed) {
      clearQtyDraft(line.id);
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      clearQtyDraft(line.id);
      return;
    }

    const desiredQty = Math.max(0, Math.floor(parsed));
    const clampedQty = clampQtyInUnit(line.productId, line.unitId, desiredQty, line.id);
    setCart((prev) => {
      if (clampedQty <= 0) {
        return prev.filter((item) => item.id !== line.id);
      }
      return prev.map((item) =>
        item.id === line.id ? { ...item, qtyInUnit: clampedQty } : item
      );
    });
    clearQtyDraft(line.id);
  }, [clampQtyInUnit, clearQtyDraft, qtyDrafts, setCart]);

  const decrementLineQty = useCallback((line: TCartLine) => {
    const newQty = line.qtyInUnit - 1;
    if (newQty <= 0) {
      removeLine(line.id);
      return;
    }

    pushUndo(cart);
    setCart((prev) => prev.map((item) =>
      item.id === line.id ? { ...item, qtyInUnit: newQty } : item
    ));
  }, [cart, pushUndo, removeLine, setCart]);

  const incrementLineQty = useCallback((line: TCartLine) => {
    const newQty = clampQtyInUnit(line.productId, line.unitId, line.qtyInUnit + 1, line.id);
    if (newQty <= line.qtyInUnit) return;

    pushUndo(cart);
    setCart((prev) => prev.map((item) =>
      item.id === line.id ? { ...item, qtyInUnit: newQty } : item
    ));
  }, [cart, clampQtyInUnit, pushUndo, setCart]);

  const setLineDiscountType = useCallback((lineId: string, nextType: PosDiscountType) => {
    setCart((prev) =>
      prev.map((item) =>
        item.id === lineId
          ? { ...item, discountType: nextType, discountValue: nextType === 'NONE' ? '' : item.discountValue ?? '' }
          : item
      )
    );
  }, [setCart]);

  const setLineDiscountValue = useCallback((lineId: string, discountValue: string) => {
    setCart((prev) => prev.map((item) =>
      item.id === lineId ? { ...item, discountValue } : item
    ));
  }, [setCart]);

  const changeLineUnit = useCallback((lineId: string, newUnitId: string) => {
    setCart((prev) =>
      prev.map((item) =>
        item.id === lineId
          ? { ...item, id: `${item.productId}:${newUnitId}`, unitId: newUnitId, qtyInUnit: 1 }
          : item
      )
    );
  }, [setCart]);

  return {
    activeLineId,
    qtyDrafts,
    setActiveLineId,
    setQtyDrafts,
    clearQtyDraft,
    removeLine,
    addToCart,
    commitLineQty,
    decrementLineQty,
    incrementLineQty,
    setLineDiscountType,
    setLineDiscountValue,
    changeLineUnit,
  };
}
