'use client';

import { useState, useTransition } from 'react';
import { generateLabelsHtmlAction } from '@/app/actions/labels';
import type { LabelSize } from '@/lib/labels/types';

export type PrintLabelSelection = {
  product: {
    id: string;
    name: string;
  };
  quantity: number;
};

type PrintLabelsButtonProps = {
  selectedProducts: PrintLabelSelection[];
  template: LabelSize;
  className?: string;
  onError?: (message: string) => void;
};

function writeHtmlToWindow(targetWindow: Window, html: string, shouldPrint: boolean) {
  if (targetWindow.closed) {
    throw new Error('The print window was closed before labels were ready.');
  }

  targetWindow.document.open();
  targetWindow.document.write(html);
  targetWindow.document.close();

  if (shouldPrint) {
    window.setTimeout(() => {
      if (targetWindow.closed) {
        return;
      }
      targetWindow.focus();
      targetWindow.print();
    }, 250);
  }
}

export default function PrintLabelsButton({
  selectedProducts,
  template,
  className = 'btn-primary',
  onError,
}: PrintLabelsButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [lastCount, setLastCount] = useState<number | null>(null);

  const handleClick = () => {
    if (selectedProducts.length === 0 || isPending) {
      return;
    }

    const popup = window.open('', '_blank');
    if (!popup) {
      onError?.('Allow pop-ups for TillFlow to open the print preview window.');
      return;
    }

    popup.document.write('<title>Preparing labels…</title><body style="font-family:system-ui;padding:24px;">Preparing labels for printing…</body>');

    startTransition(async () => {
      const result = await generateLabelsHtmlAction({
        products: selectedProducts.map(({ product, quantity }) => ({
          productId: product.id,
          quantity,
        })),
        template,
      });

      if (!result.success) {
        if (!popup.closed) {
          popup.close();
        }
        onError?.(result.error);
        return;
      }

      setLastCount(result.data.labelCount);
      try {
        writeHtmlToWindow(popup, result.data.html, true);
      } catch (error) {
        console.error('[labels] Failed to write print window', error);
        onError?.('The print window was closed before the labels were ready. Please try again.');
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={selectedProducts.length === 0 || isPending}
      className={`${className} justify-center disabled:cursor-not-allowed disabled:opacity-60`}
      aria-busy={isPending}
      title={lastCount ? `Last print run: ${lastCount} label${lastCount === 1 ? '' : 's'}` : undefined}
    >
      {isPending ? 'Preparing Print…' : 'Print Labels'}
    </button>
  );
}
