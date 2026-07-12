'use client';

import { useState, useTransition } from 'react';
import BarcodeScanInput from './BarcodeScanInput';
import { generateBarcodeAction } from '@/app/actions/products';
import { INTERNAL_BARCODE_HELP, INTERNAL_BARCODE_LABEL, isInternalBarcode } from '@/lib/products/internal-barcode';

const OVERWRITE_BLOCKED_MESSAGE =
  'This product already has a barcode. Remove it first if you want to generate an internal barcode.';

interface BarcodeFieldWithGenerateProps {
  productId: string;
  defaultValue?: string;
  /** When false, hide Generate (Starter / cashier). */
  canGenerate?: boolean;
}

export default function BarcodeFieldWithGenerate({
  productId,
  defaultValue,
  canGenerate = true,
}: BarcodeFieldWithGenerateProps) {
  const [value, setValue] = useState(defaultValue ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hasExisting = Boolean(value.trim());
  const showInternalBadge = isInternalBarcode(value);

  function handleGenerate() {
    setError(null);
    if (hasExisting) {
      setError(OVERWRITE_BLOCKED_MESSAGE);
      return;
    }
    startTransition(async () => {
      const result = await generateBarcodeAction(productId);
      if (result.success) {
        setValue(result.data.barcode);
      } else {
        setError(result.error ?? 'Could not generate barcode.');
      }
    });
  }

  function handleChange(next: string) {
    setValue(next);
    if (error) setError(null);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <div className="flex-1">
          <BarcodeScanInput name="barcode" value={value} onChange={handleChange} />
        </div>
        {canGenerate ? (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending || hasExisting}
            className="btn-secondary shrink-0 self-stretch px-3 text-xs disabled:opacity-50"
            title={hasExisting ? OVERWRITE_BLOCKED_MESSAGE : 'Generate an internal TillFlow barcode'}
          >
            {isPending ? 'Generating…' : 'Generate'}
          </button>
        ) : null}
      </div>

      {canGenerate && hasExisting ? (
        <div
          className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-2.5 py-2 text-xs text-amber-900/80"
          role="status"
        >
          <p className="font-semibold text-amber-950/90">Existing barcode detected</p>
          <p className="mt-0.5 leading-snug">{OVERWRITE_BLOCKED_MESSAGE}</p>
        </div>
      ) : null}

      {showInternalBadge ? (
        <p className="text-xs text-accent">
          <span className="font-semibold">{INTERNAL_BARCODE_LABEL}.</span> {INTERNAL_BARCODE_HELP}
        </p>
      ) : canGenerate && !hasExisting ? (
        <p className="text-xs text-black/45">
          {INTERNAL_BARCODE_LABEL}: {INTERNAL_BARCODE_HELP}
        </p>
      ) : null}

      {error && !hasExisting ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
