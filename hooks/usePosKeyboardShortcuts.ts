import { useEffect, type RefObject } from 'react';

type UsePosKeyboardShortcutsOptions = {
  activeLineId: string | null;
  barcodeRef: RefObject<HTMLInputElement>;
  canSubmit: boolean;
  cartLength: number;
  cashRef: RefObject<HTMLInputElement>;
  isCompletingSale?: boolean;
  lastCartLineId: string | null;
  lastReceiptId: string;
  productSearchRef: RefObject<HTMLInputElement>;
  onCloseKeyboardHelp: () => void;
  onCompleteSale?: () => void;
  onOpenParkModal: () => void;
  onRemoveLine: (lineId: string) => void;
  onToggleKeyboardHelp: () => void;
  onUndo: () => void;
};

export function usePosKeyboardShortcuts({
  activeLineId,
  barcodeRef,
  canSubmit,
  cartLength,
  cashRef,
  isCompletingSale = false,
  lastCartLineId,
  lastReceiptId,
  productSearchRef,
  onCloseKeyboardHelp,
  onCompleteSale,
  onOpenParkModal,
  onRemoveLine,
  onToggleKeyboardHelp,
  onUndo,
}: UsePosKeyboardShortcutsOptions) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');

      if (event.key === 'F2') {
        event.preventDefault();
        barcodeRef.current?.focus();
        return;
      }
      if (event.key === 'F3') {
        event.preventDefault();
        productSearchRef.current?.focus();
        return;
      }
      if (event.key === 'F4') {
        event.preventDefault();
        productSearchRef.current?.focus();
        return;
      }
      if (event.key === 'F8') {
        event.preventDefault();
        cashRef.current?.focus();
        return;
      }
      if (event.key === 'F9') {
        event.preventDefault();
        if (cartLength > 0) {
          onOpenParkModal();
        }
        return;
      }
      if (!isField && event.key === '/') {
        event.preventDefault();
        barcodeRef.current?.focus();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (canSubmit && !isCompletingSale) {
          onCompleteSale?.();
        }
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        onUndo();
        return;
      }
      if (event.ctrlKey && event.key === 'Backspace') {
        event.preventDefault();
        if (lastCartLineId) {
          onRemoveLine(lastCartLineId);
        }
        return;
      }
      if (event.key === 'Delete' && activeLineId) {
        event.preventDefault();
        onRemoveLine(activeLineId);
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'p') {
        if (lastReceiptId) {
          event.preventDefault();
          window.open(`/receipts/${lastReceiptId}`, '_blank', 'noopener');
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseKeyboardHelp();
        return;
      }
      if (!isField && event.key === '?') {
        event.preventDefault();
        onToggleKeyboardHelp();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    activeLineId,
    barcodeRef,
    canSubmit,
    cartLength,
    cashRef,
    isCompletingSale,
    lastCartLineId,
    lastReceiptId,
    onCloseKeyboardHelp,
    onCompleteSale,
    onOpenParkModal,
    onRemoveLine,
    onToggleKeyboardHelp,
    onUndo,
    productSearchRef,
  ]);
}
