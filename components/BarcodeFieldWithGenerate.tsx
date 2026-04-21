'use client';

import { useState, useTransition } from 'react';
import BarcodeScanInput from './BarcodeScanInput';
import { generateBarcodeAction } from '@/app/actions/products';

interface BarcodeFieldWithGenerateProps {
  productId: string;
  defaultValue?: string;
}

export default function BarcodeFieldWithGenerate({ productId, defaultValue }: BarcodeFieldWithGenerateProps) {
  const [value, setValue] = useState(defaultValue ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateBarcodeAction(productId);
      if (result.success) {
        setValue(result.data.barcode);
      } else {
        setError(result.error ?? 'Could not generate barcode.');
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <div className="flex-1">
          <BarcodeScanInput name="barcode" value={value} onChange={setValue} />
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isPending}
          className="btn-secondary shrink-0 self-stretch px-3 text-xs"
          title="Generate a new EAN-13 barcode"
        >
          {isPending ? 'Generating…' : 'Generate'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
