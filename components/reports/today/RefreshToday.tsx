'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function RefreshToday({ label, retry = false }: { label?: string; retry?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex min-w-0 items-center gap-3">
      {retry ? null : <p className="min-w-0 text-sm text-muted">Updated {label}</p>}
      <button
        type="button"
        className="inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        disabled={pending}
        onClick={() => {
          if (pending) return;
          startTransition(() => {
            router.refresh();
          });
        }}
      >
        {pending ? 'Refreshing' : retry ? 'Retry' : 'Refresh'}
      </button>
    </div>
  );
}
