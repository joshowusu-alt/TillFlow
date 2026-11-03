'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useTransition } from 'react';
import { useRouterRefreshOnVisibility } from '@/hooks/useRouterRefreshOnVisibility';

/** Reports-only control; shared Home refresh styling is unchanged. */
export default function ReportsRefresh({ fetchedAt, autoRefreshMs, compact = false }: { fetchedAt: string; autoRefreshMs?: number; compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);
  const refreshRouter = useMemo(() => ({ refresh }), [refresh]);
  useRouterRefreshOnVisibility(refreshRouter, {
    intervalMs: autoRefreshMs,
    staleThresholdMs: 20_000,
    pending,
  });
  const time = new Date(fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-slate-600">
      <span className={compact ? 'hidden sm:inline' : undefined} suppressHydrationWarning>Updated {time}</span>
      <button type="button" disabled={pending} onClick={refresh}
        className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-ink hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60">
        {pending ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}
