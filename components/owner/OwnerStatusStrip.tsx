'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { getLastSyncTime, getPendingSaleCount } from '@/lib/offline';

type OwnerStatusStripProps = {
  businessName: string;
  scopeLabel: string;
  roleLabel: string;
  fetchedAt: string;
};

export default function OwnerStatusStrip({ businessName, scopeLabel, roleLabel, fetchedAt }: OwnerStatusStripProps) {
  const isOnline = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const refreshMeta = async () => {
      try {
        const [pending, syncTime] = await Promise.all([getPendingSaleCount(), getLastSyncTime()]);
        if (!mounted) return;
        setPendingCount(pending);
        setLastSync(syncTime);
      } catch {
        if (!mounted) return;
        setPendingCount(0);
        setLastSync(null);
      }
    };

    refreshMeta();
    const interval = window.setInterval(refreshMeta, 30_000);
    window.addEventListener('online', refreshMeta);
    window.addEventListener('offline', refreshMeta);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener('online', refreshMeta);
      window.removeEventListener('offline', refreshMeta);
    };
  }, []);

  const fetchedLabel = useMemo(() => {
    return new Date(fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [fetchedAt]);

  const lastSyncLabel = useMemo(() => {
    if (!lastSync) return 'Sync cache warming up';
    return `Last sync ${new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [lastSync]);

  return (
    <div className="card animate-fade-in-up px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <StatusChip tone={isOnline ? 'online' : 'offline'}>
          <span className={isOnline ? 'status-dot-online' : 'status-dot-offline'} aria-hidden="true" />
          {isOnline ? 'Online' : 'Offline'}
        </StatusChip>
        <StatusChip tone={pendingCount > 0 ? 'warning' : 'neutral'}>
          Pending sync {pendingCount}
        </StatusChip>
        <StatusChip tone="neutral">{lastSyncLabel}</StatusChip>
        <StatusChip tone="neutral">Fetched {fetchedLabel}</StatusChip>
        <StatusChip tone="primary">{businessName}</StatusChip>
        <StatusChip tone="neutral">{scopeLabel}</StatusChip>
        <StatusChip tone="neutral">Role: {roleLabel}</StatusChip>
      </div>
    </div>
  );
}

function StatusChip({ children, tone }: { children: ReactNode; tone: 'online' | 'offline' | 'warning' | 'primary' | 'neutral' }) {
  const toneClass =
    tone === 'online'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'offline'
      ? 'border-red-200 bg-red-50 text-red-700'
      : tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : tone === 'primary'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold tracking-[0.16em] uppercase sm:gap-2 sm:px-3 sm:py-1.5 sm:text-[11px] sm:tracking-[0.18em] ${toneClass}`}>
      {children}
    </span>
  );
}
