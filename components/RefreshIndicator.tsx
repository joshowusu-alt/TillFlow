'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Shows when data was last fetched with a manual refresh button.
 * Optionally auto-refreshes every `autoRefreshMs` milliseconds.
 */
export default function RefreshIndicator({
  fetchedAt,
  autoRefreshMs,
}: {
  /** ISO string of when the server rendered the page */
  fetchedAt: string;
  /** If set, page re-fetches on this interval (e.g. 60_000 = 1 min) */
  autoRefreshMs?: number;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefreshMs) return;
    const id = setInterval(() => router.refresh(), autoRefreshMs);
    return () => clearInterval(id);
  }, [autoRefreshMs, router]);

  const handleRefresh = () => {
    setRefreshing(true);
    router.refresh();
    // Reset after a short delay (server component re-render triggers new fetchedAt)
    setTimeout(() => setRefreshing(false), 1200);
  };

  const time = new Date(fetchedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex items-center gap-2 text-xs text-black/40">
      <span suppressHydrationWarning>Updated {time}</span>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        className="rounded-lg p-1.5 hover:bg-black/5 transition disabled:opacity-50"
        title="Refresh data"
      >
        <svg
          className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>
      {autoRefreshMs ? (
        <span className="text-[10px] text-black/30">auto-refreshes every {Math.round(autoRefreshMs / 60000)} min</span>
      ) : null}
    </div>
  );
}
