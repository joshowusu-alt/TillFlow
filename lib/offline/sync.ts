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
    type OfflineProduct,
    type OfflineBusiness,
    type OfflineStore,
    type OfflineCustomer,
    type OfflineSale
} from './storage';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface SyncResult {
    synced: number;
    failed: number;
    errors: string[];
}

// Sync offline sales to server
export async function syncOfflineSales(): Promise<SyncResult> {
    const pending = await getPendingSales();

    if (pending.length === 0) {
        return { synced: 0, failed: 0, errors: [] };
    }

    const result: SyncResult = { synced: 0, failed: 0, errors: [] };

    for (const sale of pending) {
        try {
            const response = await fetch('/api/offline/sync-sale', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sale)
            });

            if (response.ok) {
                await markSaleSynced(sale.id);
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

    // Clean up synced sales after successful sync
    if (result.synced > 0) {
        await removeSyncedSales();
    }

    return result;
}

// Refresh local cache from server
export async function refreshOfflineCache(): Promise<void> {
    try {
        const response = await fetch('/api/offline/cache-data');
        if (!response.ok) throw new Error('Failed to fetch cache data');

        const data = await response.json() as {
            products: OfflineProduct[];
            business: OfflineBusiness;
            store: OfflineStore;
            customers: OfflineCustomer[];
            tills: Array<{ id: string; name: string }>;
        };

        await Promise.all([
            cacheProducts(data.products),
            cacheBusiness(data.business),
            cacheStore(data.store),
            cacheCustomers(data.customers),
            cacheTills(data.tills)
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

// Auto-sync when coming online
export function setupAutoSync(
    onSyncStart: () => void,
    onSyncComplete: (result: SyncResult) => void,
    onSyncError: (error: Error) => void
): () => void {
    const handleOnline = async () => {
        onSyncStart();
        try {
            // First sync any pending sales
            const syncResult = await syncOfflineSales();

            // Then refresh the cache
            await refreshOfflineCache();

            onSyncComplete(syncResult);
        } catch (error) {
            onSyncError(error instanceof Error ? error : new Error('Sync failed'));
        }
    };

    window.addEventListener('online', handleOnline);

    return () => {
        window.removeEventListener('online', handleOnline);
    };
}

// Check if currently online
export function isOnline(): boolean {
    if (typeof window === 'undefined') return true;
    return navigator.onLine;
}
