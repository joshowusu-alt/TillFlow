'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { generateMissingBarcodesAction } from '@/app/actions/products';

function buildSuccessMessage(generated: number, failed: number) {
  if (generated <= 0 && failed <= 0) return null;
  const parts = [
    `Generated ${generated} internal barcode${generated === 1 ? '' : 's'}. You can now print labels.`,
  ];
  if (failed > 0) {
    parts.push(`${failed} failed.`);
  }
  return parts.join(' ');
}

export default function GenerateMissingBarcodesButton({
  missingCount,
  initialGenerated = 0,
  initialFailed = 0,
}: {
  missingCount: number;
  /** Survives revalidatePath via ?barcodesGenerated= */
  initialGenerated?: number;
  initialFailed?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [generated, setGenerated] = useState(Math.max(0, initialGenerated));
  const [failed, setFailed] = useState(Math.max(0, initialFailed));
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const message = useMemo(() => buildSuccessMessage(generated, failed), [generated, failed]);

  if (missingCount <= 0 && !message) return null;

  function persistFlash(nextGenerated: number, nextFailed: number) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (nextGenerated > 0) {
      params.set('barcodesGenerated', String(nextGenerated));
    } else {
      params.delete('barcodesGenerated');
    }
    if (nextFailed > 0) {
      params.set('barcodesFailed', String(nextFailed));
    } else {
      params.delete('barcodesFailed');
    }
    const qs = params.toString();
    router.replace(`${pathname ?? '/products'}${qs ? `?${qs}` : ''}`, { scroll: false });
    router.refresh();
  }

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await generateMissingBarcodesAction();
      setConfirm(false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setGenerated(result.data.generated);
      setFailed(result.data.failed);
      persistFlash(result.data.generated, result.data.failed);
    });
  }

  return (
    <div className="space-y-2">
      {generated === 0 && missingCount > 0 ? (
        confirm ? (
          <div className="flex flex-col gap-2 rounded-xl border border-accent/20 bg-accentSoft/40 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink">
              Generate internal barcodes for{' '}
              <span className="font-semibold">{missingCount}</span> product
              {missingCount === 1 ? '' : 's'} without barcodes?
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-primary text-xs" onClick={run} disabled={pending}>
                {pending ? 'Generating…' : 'Yes, generate'}
              </button>
              <button type="button" className="btn-secondary text-xs" onClick={() => setConfirm(false)} disabled={pending}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn-secondary text-sm" onClick={() => setConfirm(true)} disabled={pending}>
            Generate missing barcodes ({missingCount})
          </button>
        )
      ) : null}

      {message ? (
        <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{message}</span>
          {generated > 0 ? (
            <Link href="/products/labels" className="btn-primary text-xs whitespace-nowrap">
              Print labels
            </Link>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
