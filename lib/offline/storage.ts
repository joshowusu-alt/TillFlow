'use client';

import { openDB, type IDBPDatabase } from 'idb';

export interface OfflineProduct {
    id: string;
    name: string;
    barcode: string | null;
    sellingPriceBasePence: number;
    vatRateBps: number;
    promoBuyQty: number;
    promoGetQty: number;
    onHandBase: number;
    units: Array<{
        id: string;
        name: string;
        pluralName: string;
        conversionToBase: number;
        isBaseUnit: boolean;
    }>;
}

export interface OfflineBusiness {
    id: string;
    currency: string;
    vatEnabled: boolean;
}

export interface OfflineStore {
    id: string;
    name: string;
}

export interface OfflineCustomer {
    id: string;
    name: string;
}

export interface OfflineSale {
    id: string;
    storeId: string;
    tillId: string;
    customerId: string | null;
    paymentStatus: 'PAID' | 'PART_PAID' | 'UNPAID';
    lines: Array<{
        productId: string;
        unitId: string;
        qtyInUnit: number;
        discountType: string;
        discountValue: string;
    }>;
    payments: Array<{
        method: 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';
        amountPence: number;
    }>;
    orderDiscountType: string;
    orderDiscountValue: string;
    createdAt: string;
    synced: boolean;
}

const DB_NAME = 'pos-offline-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB(): Promise<IDBPDatabase> {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('IndexedDB not available on server'));
    }

    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                // Products store
                if (!db.objectStoreNames.contains('products')) {
                    db.createObjectStore('products', { keyPath: 'id' });
                }

                // Business settings store
                if (!db.objectStoreNames.contains('business')) {
                    db.createObjectStore('business', { keyPath: 'id' });
                }

                // Store info
                if (!db.objectStoreNames.contains('store')) {
                    db.createObjectStore('store', { keyPath: 'id' });
                }

                // Customers store
                if (!db.objectStoreNames.contains('customers')) {
                    db.createObjectStore('customers', { keyPath: 'id' });
                }

                // Tills store
                if (!db.objectStoreNames.contains('tills')) {
                    db.createObjectStore('tills', { keyPath: 'id' });
                }

                // Offline sales queue
                if (!db.objectStoreNames.contains('salesQueue')) {
                    const salesStore = db.createObjectStore('salesQueue', { keyPath: 'id' });
                    salesStore.createIndex('synced', 'synced', { unique: false });
                }

                // Sync metadata
                if (!db.objectStoreNames.contains('syncMeta')) {
                    db.createObjectStore('syncMeta', { keyPath: 'key' });
                }
            }
        });
    }

    return dbPromise;
}

// Product caching
export async function cacheProducts(products: OfflineProduct[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('products', 'readwrite');

    // Clear existing and add new
    await tx.store.clear();
    for (const product of products) {
        await tx.store.put(product);
    }
    await tx.done;

    // Update sync timestamp
    await updateSyncMeta('products', new Date().toISOString());
}

export async function getCachedProducts(): Promise<OfflineProduct[]> {
    const db = await getDB();
    return db.getAll('products');
}

// Business caching
export async function cacheBusiness(business: OfflineBusiness): Promise<void> {
    const db = await getDB();
    await db.put('business', business);
    await updateSyncMeta('business', new Date().toISOString());
}

export async function getCachedBusiness(): Promise<OfflineBusiness | undefined> {
    const db = await getDB();
    const all = await db.getAll('business');
    return all[0];
}

// Store caching
export async function cacheStore(store: OfflineStore): Promise<void> {
    const db = await getDB();
    await db.put('store', store);
    await updateSyncMeta('store', new Date().toISOString());
}

export async function getCachedStore(): Promise<OfflineStore | undefined> {
    const db = await getDB();
    const all = await db.getAll('store');
    return all[0];
}

// Customers caching
export async function cacheCustomers(customers: OfflineCustomer[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('customers', 'readwrite');
    await tx.store.clear();
    for (const customer of customers) {
        await tx.store.put(customer);
    }
    await tx.done;
    await updateSyncMeta('customers', new Date().toISOString());
}

export async function getCachedCustomers(): Promise<OfflineCustomer[]> {
    const db = await getDB();
    return db.getAll('customers');
}

// Tills caching
export async function cacheTills(tills: Array<{ id: string; name: string }>): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('tills', 'readwrite');
    await tx.store.clear();
    for (const till of tills) {
        await tx.store.put(till);
    }
    await tx.done;
    await updateSyncMeta('tills', new Date().toISOString());
}

export async function getCachedTills(): Promise<Array<{ id: string; name: string }>> {
    const db = await getDB();
    return db.getAll('tills');
}

// Offline sales queue
export async function queueOfflineSale(sale: Omit<OfflineSale, 'id' | 'synced'>): Promise<string> {
    const db = await getDB();
    const id = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const offlineSale: OfflineSale = {
        ...sale,
        id,
        synced: false
    };
    await db.put('salesQueue', offlineSale);
    return id;
}

export async function getPendingSales(): Promise<OfflineSale[]> {
    const db = await getDB();
    const all = await db.getAll('salesQueue');
    return all.filter((sale) => !sale.synced);
}

export async function getOfflineSale(id: string): Promise<OfflineSale | undefined> {
    const db = await getDB();
    return db.get('salesQueue', id);
}

export async function updateOfflineSale(sale: OfflineSale): Promise<void> {
    const db = await getDB();
    await db.put('salesQueue', sale);
}

export async function markSaleSynced(id: string): Promise<void> {
    const db = await getDB();
    const sale = await db.get('salesQueue', id);
    if (sale) {
        sale.synced = true;
        await db.put('salesQueue', sale);
    }
}

export async function removeSyncedSales(): Promise<number> {
    const db = await getDB();
    const all = await db.getAll('salesQueue');
    const synced = all.filter((sale) => sale.synced);

    const tx = db.transaction('salesQueue', 'readwrite');
    for (const sale of synced) {
        await tx.store.delete(sale.id);
    }
    await tx.done;

    return synced.length;
}

// Sync metadata
async function updateSyncMeta(key: string, value: string): Promise<void> {
    const db = await getDB();
    await db.put('syncMeta', { key, value, updatedAt: new Date().toISOString() });
}

export async function getSyncMeta(key: string): Promise<string | null> {
    const db = await getDB();
    const meta = await db.get('syncMeta', key);
    return meta?.value ?? null;
}

export async function getLastSyncTime(): Promise<string | null> {
    const db = await getDB();
    const all = await db.getAll('syncMeta');
    if (all.length === 0) return null;

    // Return the most recent sync time
    const times = all.map((m) => m.updatedAt).filter(Boolean);
    if (times.length === 0) return null;

    times.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return times[0];
}

// Check if we have cached data
export async function hasCachedData(): Promise<boolean> {
    try {
        const products = await getCachedProducts();
        const business = await getCachedBusiness();
        return products.length > 0 && !!business;
    } catch {
        return false;
    }
}

// Clear all offline data
export async function clearOfflineData(): Promise<void> {
    const db = await getDB();

    const stores = ['products', 'business', 'store', 'customers', 'tills', 'salesQueue', 'syncMeta'];
    for (const store of stores) {
        const tx = db.transaction(store, 'readwrite');
        await tx.store.clear();
        await tx.done;
    }
}
