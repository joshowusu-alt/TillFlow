'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/components/ToastProvider';
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
    const { toast } = useToast();
    const prevOnline = useRef(true);

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
                toast(`\u2713 ${result.synced} sale${result.synced !== 1 ? 's' : ''} synced successfully`, 'success');
            }
            if (result.failed > 0) {
                toast(`${result.failed} sale${result.failed !== 1 ? 's' : ''} failed to sync \u2014 check System Health`, 'error');
            }

            await checkPending();
        } catch (error) {
            console.error('Manual sync failed:', error);
            toast('Sync failed. Will retry automatically.', 'error');
        } finally {
            setSyncing(false);
        }
    };

    useEffect(() => {
        // Set initial state
        const initial = isOnline();
        setOnline(initial);
        prevOnline.current = initial;
        checkPending();

        // Listen for online/offline events
        const handleOnline = () => {
            setOnline(true);
            if (!prevOnline.current) {
                toast('Back online \u2014 syncing pending sales\u2026', 'info');
            }
            prevOnline.current = true;
        };
        const handleOffline = () => {
            setOnline(false);
            prevOnline.current = false;
            toast('You\u2019re offline \u2014 sales will be saved locally', 'info');
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Setup auto-sync
        const cleanup = setupAutoSync(
            () => setSyncing(true),
            (result) => {
                setSyncing(false);
                setLastSync(result);
                checkPending();
                if (result.synced > 0) {
                    toast(`\u2713 ${result.synced} sale${result.synced !== 1 ? 's' : ''} synced`, 'success');
                }
                if (result.failed > 0) {
                    toast(`${result.failed} sale${result.failed !== 1 ? 's' : ''} failed to sync`, 'error');
                }
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
    }, [checkPending, toast]);

    // Don't show status pill if fully online with nothing pending
    if (online && pendingCount === 0 && !syncing) {
        return null;
    }

    // Choose status appearance
    const statusConfig = (() => {
        if (!online) return {
            bg: 'bg-red-600',
            text: 'Offline',
            sub: 'Sales saved locally',
        };
        if (syncing) return {
            bg: 'bg-accent',
            text: 'Syncing\u2026',
            sub: `${pendingCount} pending`,
        };
        return {
            bg: 'bg-amber-600',
            text: `${pendingCount} pending`,
            sub: 'Tap to sync',
        };
    })();

    return (
        <div className="fixed bottom-4 right-4 z-50">
            <div
                className={`${statusConfig.bg} flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm text-white shadow-lg transition-all duration-200`}
            >
                {/* Status icon */}
                {syncing ? (
                    <svg className="h-4 w-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                ) : online ? (
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                    </svg>
                ) : (
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a5 5 0 01-1.414-7.072m0 0L9.879 5.636m-2.829 2.829L3 5" />
                    </svg>
                )}

                {/* Status text */}
                <div className="leading-tight">
                    <div className="font-semibold text-xs">{statusConfig.text}</div>
                    <div className="text-[10px] opacity-80">{statusConfig.sub}</div>
                </div>

                {/* Sync button */}
                {online && pendingCount > 0 && !syncing && (
                    <button
                        onClick={handleSync}
                        className="ml-1 rounded-lg bg-white/20 px-2 py-1 text-xs font-semibold hover:bg-white/30 transition-colors"
                        aria-label="Sync now"
                    >
                        Sync
                    </button>
                )}

                {/* Expand/collapse */}
                <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="rounded-lg bg-white/15 p-1 hover:bg-white/25 transition-colors"
                    aria-label={showDetails ? 'Hide sync details' : 'Show sync details'}
                >
                    <svg
                        className={`h-3 w-3 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            </div>

            {/* Details panel */}
            {showDetails && (
                <div className="mt-2 rounded-xl border border-gray-200 bg-white p-4 shadow-soft animate-scale-in">
                    <div className="space-y-2.5 text-sm">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-500">Connection</span>
                            <span className={`font-semibold ${online ? 'text-success' : 'text-rose'}`}>
                                {online ? 'Online' : 'Offline'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-500">Pending</span>
                            <span className="font-semibold">{pendingCount} sale{pendingCount !== 1 ? 's' : ''}</span>
                        </div>
                        {lastSync && (
                            <>
                                <div className="border-t border-gray-100 pt-2.5">
                                    <div className="text-xs font-medium text-gray-400 mb-2">Last sync result</div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Synced</span>
                                    <span className="font-semibold text-success">{lastSync.synced}</span>
                                </div>
                                {lastSync.failed > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-500">Failed</span>
                                        <span className="font-semibold text-rose">{lastSync.failed}</span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {!online && (
                        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                            Sales are being saved to this device. They will sync automatically when you\u2019re back online.
                        </div>
                    )}

                    {online && pendingCount > 0 && !syncing && (
                        <button
                            onClick={handleSync}
                            className="mt-3 w-full rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/80 transition-colors"
                        >
                            Sync {pendingCount} pending sale{pendingCount !== 1 ? 's' : ''} now
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
