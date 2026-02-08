'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    isOnline,
    setupAutoSync,
    syncOfflineSales,
    refreshOfflineCache,
    getPendingSales,
    type SyncResult
} from '@/lib/offline';

export default function NetworkStatus() {
    const [online, setOnline] = useState(true);
    const [pendingCount, setPendingCount] = useState(0);
    const [syncing, setSyncing] = useState(false);
    const [lastSync, setLastSync] = useState<SyncResult | null>(null);
    const [showDetails, setShowDetails] = useState(false);

    // Check pending sales count
    const checkPending = useCallback(async () => {
        try {
            const pending = await getPendingSales();
            setPendingCount(pending.length);
        } catch {
            setPendingCount(0);
        }
    }, []);

    // Manual sync
    const handleSync = async () => {
        if (syncing || !online) return;

        setSyncing(true);
        try {
            const result = await syncOfflineSales();
            setLastSync(result);

            if (result.synced > 0) {
                await refreshOfflineCache();
            }

            await checkPending();
        } catch (error) {
            console.error('Manual sync failed:', error);
        } finally {
            setSyncing(false);
        }
    };

    useEffect(() => {
        // Set initial state
        setOnline(isOnline());
        checkPending();

        // Listen for online/offline events
        const handleOnline = () => setOnline(true);
        const handleOffline = () => setOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Setup auto-sync
        const cleanup = setupAutoSync(
            () => setSyncing(true),
            (result) => {
                setSyncing(false);
                setLastSync(result);
                checkPending();
            },
            (error) => {
                setSyncing(false);
                console.error('Auto-sync error:', error);
            }
        );

        // Periodically check pending
        const interval = setInterval(checkPending, 30000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            cleanup();
            clearInterval(interval);
        };
    }, [checkPending]);

    // Don't show if online and nothing pending
    if (online && pendingCount === 0 && !syncing) {
        return null;
    }

    return (
        <div className="fixed bottom-4 right-4 z-50">
            <div
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-lg transition-all ${online
                        ? syncing
                            ? 'bg-blue-500 text-white'
                            : pendingCount > 0
                                ? 'bg-amber-500 text-white'
                                : 'bg-emerald-500 text-white'
                        : 'bg-rose-500 text-white'
                    }`}
            >
                {/* Status icon */}
                {syncing ? (
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                ) : online ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                    </svg>
                ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a5 5 0 01-1.414-7.072m0 0L9.879 5.636m-2.829 2.829L3 5" />
                    </svg>
                )}

                {/* Status text */}
                <span>
                    {syncing
                        ? 'Syncing...'
                        : online
                            ? pendingCount > 0
                                ? `${pendingCount} pending`
                                : 'Online'
                            : 'Offline'}
                </span>

                {/* Pending badge */}
                {pendingCount > 0 && !syncing && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-xs">
                        {pendingCount}
                    </span>
                )}

                {/* Sync button */}
                {online && pendingCount > 0 && !syncing && (
                    <button
                        onClick={handleSync}
                        className="ml-1 rounded-lg bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30"
                    >
                        Sync
                    </button>
                )}

                {/* Expand/collapse */}
                <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="ml-1 rounded-lg bg-white/20 p-0.5 hover:bg-white/30"
                >
                    <svg
                        className={`h-3 w-3 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            </div>

            {/* Details panel */}
            {showDetails && (
                <div className="mt-2 rounded-xl border border-black/5 bg-white p-4 shadow-lg">
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-black/50">Status</span>
                            <span className={`font-semibold ${online ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {online ? 'Online' : 'Offline'}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-black/50">Pending sales</span>
                            <span className="font-semibold">{pendingCount}</span>
                        </div>
                        {lastSync && (
                            <>
                                <div className="border-t border-black/5 pt-2">
                                    <div className="text-xs text-black/40">Last sync</div>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-black/50">Synced</span>
                                    <span className="font-semibold text-emerald-600">{lastSync.synced}</span>
                                </div>
                                {lastSync.failed > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-black/50">Failed</span>
                                        <span className="font-semibold text-rose-600">{lastSync.failed}</span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {!online && (
                        <div className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                            Sales made while offline will sync automatically when you're back online.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
