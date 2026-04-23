import { useEffect, useRef, type RefObject } from 'react';
import {
  handleScannerEnter,
  resetScannerBuffer,
  updateScannerBufferState,
} from '@/lib/payments/pos-scanner';

type ScannerBufferState = {
  value: string;
  lastTime: number;
  fastCount: number;
  timer?: ReturnType<typeof setTimeout>;
  active: boolean;
};

type UsePosScannerBufferOptions = {
  barcodeRef: RefObject<HTMLInputElement>;
  onScan: (code: string) => void;
};

export function usePosScannerBuffer({ barcodeRef, onScan }: UsePosScannerBufferOptions) {
  const scanBufferRef = useRef<ScannerBufferState>({
    value: '',
    lastTime: 0,
    fastCount: 0,
    active: false,
  });

  useEffect(() => {
    const scanBuffer = scanBufferRef.current;
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && barcodeRef.current && target === barcodeRef.current) return;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');
      const key = event.key;
      const now = Date.now();
      const state = scanBuffer;

      if (key === 'Enter') {
        const enterResult = handleScannerEnter(state);
        if (enterResult.shouldScan && enterResult.code) {
          event.preventDefault();
          if (state.timer) clearTimeout(state.timer);
          onScan(enterResult.code);
        }
        return;
      }

      updateScannerBufferState(state, key, now);
      if (key.length !== 1) return;

      if (state.active && (!isEditable || target !== barcodeRef.current)) {
        event.preventDefault();
      }

      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        resetScannerBuffer(state);
      }, 250);
    };

    window.addEventListener('keydown', handler);
    return () => {
      if (scanBuffer.timer) clearTimeout(scanBuffer.timer);
      window.removeEventListener('keydown', handler);
    };
  }, [barcodeRef, onScan]);
}
