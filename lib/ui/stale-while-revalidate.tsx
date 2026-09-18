'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Keep the last successful client payload visible while a newer value arrives.
 * Use on Agent 5 client lists (labels today). Agent 0 can wrap other lists.
 */
export function useStaleWhileRevalidate<T>(data: T): {
  data: T;
  updatedAt: Date;
  refreshing: boolean;
} {
  const lastRef = useRef(data);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (data === lastRef.current) return;
    setRefreshing(true);
    lastRef.current = data;
    setUpdatedAt(new Date());
    const timer = window.setTimeout(() => setRefreshing(false), 240);
    return () => window.clearTimeout(timer);
  }, [data]);

  return { data: lastRef.current, updatedAt, refreshing };
}

export function ListRefreshHint({
  updatedAt,
  refreshing,
}: {
  updatedAt: Date;
  refreshing?: boolean;
}) {
  const time = updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <p className="text-xs text-black/45" data-list-refresh-hint>
      {refreshing ? 'Refreshing…' : `Updated ${time}`}
    </p>
  );
}

export function StaleWhileRevalidate({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
