'use client';

import {
    getPendingSales,
    markSaleSynced,
    removeSyncedSales,
    cacheProducts,
    cacheBusiness,
    cacheStore,
    cacheCustomers,
    cacheTills,
    setActiveOfflineScope,
    type OfflineProduct,
    type OfflineBusiness,
    type OfflineStore,
    type OfflineCustomer,
    type OfflineSale
} from './storage';
import { getClientActiveBusinessId, getOfflineCacheUrl } from '@/lib/business-scope';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface SyncResult {
    synced: number;
    failed: number;
    errors: string[];
}

// Sync offline sales to server (batch with one-at-a-time fallback)
export async function syncOfflineSales(businessId?: string): Promise<SyncResult> {
    const resolvedBusinessId = businessId ?? getClientActiveBusinessId() ?? undefined;
    const pending = await getPendingSales(resolvedBusinessId);

    if (pending.length === 0) {
        return { synced: 0, failed: 0, errors: [] };
    }

    // Try batch sync first
    const batchResult = await tryBatchSync(pending, resolvedBusinessId);
    if (batchResult) return batchResult;

    // Fall back to one-at-a-time if batch endpoint unavailable
    return syncOneAtATime(pending, resolvedBusinessId);
}

async function tryBatchSync(pending: OfflineSale[], businessId?: string): Promise<SyncResult | null> {
    try {
        const response = await fetch('/api/offline/batch-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sales: pending })
        });

        // Batch endpoint not available — fall back
        if (response.status === 404) return null;

        if (!response.ok) {
            // Server error on entire batch — fall back to one-at-a-time
            return null;
        }

        const data = await response.json() as {
            synced: string[];
            failed: Array<{ id: string; error: string }>;
        };

        // Mark each synced sale individually
        for (const id of data.synced) {
            await markSaleSynced(id, businessId);
        }

        const result: SyncResult = {
            synced: data.synced.length,
            failed: data.failed.length,
            errors: data.failed.map((f) => `Sale ${f.id}: ${f.error}`)
        };

        if (result.synced > 0) {
            await removeSyncedSales(businessId);
        }

        return result;
    } catch {
        // Network error — fall back to one-at-a-time
        return null;
    }
}

async function syncOneAtATime(pending: OfflineSale[], businessId?: string): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, failed: 0, errors: [] };

    for (const sale of pending) {
        try {
            const response = await fetch('/api/offline/sync-sale', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sale)
            });

            if (response.ok) {
                await markSaleSynced(sale.id, businessId);
                result.synced++;
            } else {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                result.failed++;
                result.errors.push(`Sale ${sale.id}: ${errorData.error || response.statusText}`);
            }
        } catch (error) {
            result.failed++;
            result.errors.push(`Sale ${sale.id}: ${error instanceof Error ? error.message : 'Network error'}`);
        }
    }

    if (result.synced > 0) {
        await removeSyncedSales(businessId);
    }

    return result;
}

// Get count of pending offline sales
export async function getPendingSaleCount(): Promise<number> {
    try {
        const pending = await getPendingSales(getClientActiveBusinessId() ?? undefined);
        return pending.length;
    } catch {
        return 0;
    }
}

// Refresh local cache from server
export async function refreshOfflineCache(businessId?: string): Promise<void> {
    try {
        const resolvedBusinessId = businessId ?? getClientActiveBusinessId() ?? undefined;
        if (!resolvedBusinessId) {
            throw new Error('No active business selected');
        }

        const response = await fetch(getOfflineCacheUrl(resolvedBusinessId));
        if (!response.ok) {
            let message = `Failed to fetch cache data (${response.status})`;
            const contentType = response.headers.get('content-type') ?? '';

            if (contentType.includes('application/json')) {
                const errorData = await response.json().catch(() => null) as { error?: string } | null;
                if (errorData?.error) {
                    message = errorData.error;
                }
            } else {
                const body = await response.text().catch(() => '');
                if (body && /^<!DOCTYPE|^<html/i.test(body.trim())) {
                    message = 'Offline cache endpoint returned HTML instead of JSON';
                }
            }

            throw new Error(message);
        }

        const data = await response.json() as {
            products: OfflineProduct[];
            business: OfflineBusiness;
            store: OfflineStore;
            customers: OfflineCustomer[];
            tills: Array<{ id: string; name: string }>;
        };

        await Promise.all([
            cacheProducts({ businessId: data.business.id, storeId: data.store.id }, data.products),
            cacheBusiness(data.business),
            cacheStore(data.store),
            cacheCustomers(data.business.id, data.customers),
            cacheTills({ businessId: data.business.id, storeId: data.store.id }, data.tills),
            setActiveOfflineScope({ businessId: data.business.id, storeId: data.store.id })
        ]);
    } catch (error) {
        console.error('Failed to refresh offline cache:', error);
        throw error;
    }
}

// Listen for online/offline events
export function setupNetworkListeners(
    onOnline: () => void,
    onOffline: () => void
): () => void {
    const handleOnline = () => {
        console.log('Network: Online');
        onOnline();
    };

    const handleOffline = () => {
        console.log('Network: Offline');
        onOffline();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
}

/**
 * Auto-sync with exponential backoff retry.
 * When the device comes back online, immediately attempt to sync pending sales.
 * On failure, retry with increasing delays (2s, 4s, 8s, 16s, max 30s).
 */
export function setupAutoSync(
    onSyncStart: () => void,
    onSyncComplete: (result: SyncResult) => void,
    onSyncError: (error: Error) => void
): () => void {
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    const BASE_DELAY = 2000;
    const MAX_DELAY = 30000;

    const attemptSync = async () => {
        onSyncStart();
        try {
            const syncResult = await syncOfflineSales();
            await refreshOfflineCache();
            retryCount = 0;
            onSyncComplete(syncResult);
        } catch (error) {
            retryCount++;
            if (retryCount <= MAX_RETRIES && navigator.onLine) {
                const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount - 1), MAX_DELAY);
                console.log(`Sync failed, retrying in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`);
                retryTimer = setTimeout(attemptSync, delay);
            } else {
                retryCount = 0;
                onSyncError(error instanceof Error ? error : new Error('Sync failed after retries'));
            }
        }
    };

    const handleOnline = () => {
        retryCount = 0;
        attemptSync();
    };

    window.addEventListener('online', handleOnline);

    // Also attempt sync on setup if already online and there might be pending sales
    if (navigator.onLine) {
        setTimeout(attemptSync, 1000);
    }

    return () => {
        window.removeEventListener('online', handleOnline);
        if (retryTimer) clearTimeout(retryTimer);
    };
}

// Check if currently online
export function isOnline(): boolean {
    if (typeof window === 'undefined') return true;
    return navigator.onLine;
}
