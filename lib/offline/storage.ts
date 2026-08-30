'use client';

import { openDB, type IDBPDatabase } from 'idb';
import {
    getClientActiveBusinessId,
    getOfflineActiveBusinessMetaKey,
    getOfflineActiveStoreMetaKey,
} from '@/lib/business-scope';

export interface OfflineProduct {
    businessId: string;
    storeId: string;
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
        sellingPricePence?: number | null;
        defaultCostPence?: number | null;
    }>;
}

export interface OfflineBusiness {
    id: string;
    currency: string;
    vatEnabled: boolean;
}

export interface OfflineStore {
    businessId: string;
    id: string;
    name: string;
}

export interface OfflineCustomer {
    businessId: string;
    id: string;
    name: string;
}

export interface OfflineTill {
    businessId: string;
    storeId: string;
    id: string;
    name: string;
}

export type OfflineSaleQueueStatus =
    | 'pending'
    | 'synced'
    | 'already_synced'
    | 'needs_review'
    | 'rejected';

export interface OfflineSaleLine {
    productId: string;
    unitId: string;
    qtyInUnit: number;
    qtyBase?: number;
    unitPricePence?: number;
    lineSubtotalPence?: number;
    discountType: string;
    discountValue: string;
}

export interface OfflineSale {
    id: string;
    businessId: string;
    storeId: string;
    tillId: string;
    shiftId: string | null;
    cashierUserId: string | null;
    customerId: string | null;
    paymentStatus: 'PAID' | 'PART_PAID' | 'UNPAID';
    lines: OfflineSaleLine[];
    payments: Array<{
        method: 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';
        amountPence: number;
    }>;
    orderDiscountType: string;
    orderDiscountValue: string;
    createdAt: string;
    localSaleTime: string;
    localSequence: number;
    idempotencyKey: string;
    payloadHash: string;
    catalogueVersion?: string | null;
    inventoryPolicy?: 'enforce' | 'allow-negative';
    synced: boolean;
    status: OfflineSaleQueueStatus;
    statusReason?: string;
}

export type OfflineSaleCaptureInput = Omit<
    OfflineSale,
    'id' | 'synced' | 'status' | 'statusReason' | 'localSequence' | 'payloadHash' | 'localSaleTime' | 'shiftId' | 'cashierUserId' | 'idempotencyKey'
> & {
    shiftId?: string | null;
    cashierUserId?: string | null;
    localSaleTime?: string;
    localSequence?: number;
    idempotencyKey?: string;
    payloadHash?: string;
    status?: OfflineSaleQueueStatus;
    statusReason?: string;
    synced?: boolean;
};

type SyncMetaRecord = {
    key: string;
    value: string;
    updatedAt: string;
};

const DB_NAME = 'pos-offline-db';
const DB_VERSION = 3;
const STORE_NAMES = ['products', 'business', 'store', 'customers', 'tills', 'salesQueue', 'syncMeta'] as const;
const LOCAL_SEQUENCE_META_PREFIX = 'localSequence:';

/**
 * Migrate a raw IDB queue row to the immutable-capture shape.
 * Legacy rows without shiftId are parked as needs_review (never silently rebound).
 */
export function migrateQueuedSaleRecord(raw: Partial<OfflineSale> & { id?: string; synced?: boolean }): OfflineSale {
    const createdAt = raw.createdAt ?? new Date().toISOString();
    const shiftId = raw.shiftId ?? null;
    const synced = Boolean(raw.synced);
    const missingShift = !shiftId;
    let status: OfflineSaleQueueStatus = raw.status ?? (synced ? 'synced' : 'pending');
    let statusReason = raw.statusReason;
    if (!synced && missingShift && status === 'pending') {
        status = 'needs_review';
        statusReason = statusReason ?? 'missing_shift';
    }

    return {
        id: String(raw.id ?? ''),
        businessId: String(raw.businessId ?? ''),
        storeId: String(raw.storeId ?? ''),
        tillId: String(raw.tillId ?? ''),
        shiftId,
        cashierUserId: raw.cashierUserId ?? null,
        customerId: raw.customerId ?? null,
        paymentStatus: raw.paymentStatus ?? 'PAID',
        lines: Array.isArray(raw.lines) ? raw.lines : [],
        payments: Array.isArray(raw.payments) ? raw.payments : [],
        orderDiscountType: raw.orderDiscountType ?? 'NONE',
        orderDiscountValue: raw.orderDiscountValue ?? '',
        createdAt,
        localSaleTime: raw.localSaleTime ?? createdAt,
        localSequence: Number(raw.localSequence) || 0,
        idempotencyKey: raw.idempotencyKey || String(raw.id ?? ''),
        payloadHash: raw.payloadHash ?? '',
        catalogueVersion: raw.catalogueVersion ?? null,
        inventoryPolicy: raw.inventoryPolicy ?? 'enforce',
        synced,
        status,
        statusReason,
    };
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function resolveBusinessId(businessId?: string | null) {
    return businessId ?? getClientActiveBusinessId() ?? undefined;
}

export function getDB(): Promise<IDBPDatabase> {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('IndexedDB not available on server'));
    }

    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            async upgrade(db, oldVersion, _newVersion, tx) {
                if (!db.objectStoreNames.contains('products')) {
                    db.createObjectStore('products', { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains('business')) {
                    db.createObjectStore('business', { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains('store')) {
                    db.createObjectStore('store', { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains('customers')) {
                    db.createObjectStore('customers', { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains('tills')) {
                    db.createObjectStore('tills', { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains('salesQueue')) {
                    const salesStore = db.createObjectStore('salesQueue', { keyPath: 'id' });
                    salesStore.createIndex('synced', 'synced', { unique: false });
                }

                if (!db.objectStoreNames.contains('syncMeta')) {
                    db.createObjectStore('syncMeta', { keyPath: 'key' });
                }

                if (oldVersion < 2) {
                    for (const storeName of STORE_NAMES) {
                        if (db.objectStoreNames.contains(storeName)) {
                            tx.objectStore(storeName).clear();
                        }
                    }
                }

                if (oldVersion < 3 && db.objectStoreNames.contains('salesQueue')) {
                    const salesStore = tx.objectStore('salesQueue');
                    const rows = (await salesStore.getAll()) as Array<Partial<OfflineSale>>;
                    for (const row of rows) {
                        const migrated = migrateQueuedSaleRecord(row);
                        if (migrated.id) {
                            await salesStore.put(migrated);
                        }
                    }
                }
            }
        });
    }

    return dbPromise;
}

async function updateSyncMeta(key: string, value: string): Promise<void> {
    const db = await getDB();
    await db.put('syncMeta', { key, value, updatedAt: new Date().toISOString() } satisfies SyncMetaRecord);
}

async function clearScopedRecords<T extends { id: string }>(
    storeName: string,
    matches: (record: T) => boolean
): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(storeName, 'readwrite');
    const all = await tx.store.getAll() as T[];
    for (const record of all) {
        if (matches(record)) {
            await tx.store.delete(record.id);
        }
    }
    await tx.done;
}

export async function setActiveOfflineScope(scope: { businessId: string; storeId: string }): Promise<void> {
    await Promise.all([
        updateSyncMeta(getOfflineActiveBusinessMetaKey(), scope.businessId),
        updateSyncMeta(getOfflineActiveStoreMetaKey(), scope.storeId),
    ]);
}

export async function cacheProducts(
    scope: { businessId: string; storeId: string },
    products: OfflineProduct[]
): Promise<void> {
    await clearScopedRecords<OfflineProduct>('products', (record) =>
        record.businessId === scope.businessId && record.storeId === scope.storeId
    );

    const db = await getDB();
    const tx = db.transaction('products', 'readwrite');
    for (const product of products) {
        await tx.store.put({ ...product, businessId: scope.businessId, storeId: scope.storeId });
    }
    await tx.done;

    await updateSyncMeta(`products:${scope.businessId}:${scope.storeId}`, new Date().toISOString());
}

export async function getCachedProducts(
    businessId?: string,
    storeId?: string
): Promise<OfflineProduct[]> {
    const db = await getDB();
    const resolvedBusinessId = resolveBusinessId(businessId);
    const all = await db.getAll('products') as OfflineProduct[];
    return all.filter((product) => {
        if (resolvedBusinessId && product.businessId !== resolvedBusinessId) return false;
        if (storeId && product.storeId !== storeId) return false;
        return true;
    });
}

export async function cacheBusiness(business: OfflineBusiness): Promise<void> {
    const db = await getDB();
    await db.put('business', business);
    await updateSyncMeta(`business:${business.id}`, new Date().toISOString());
}

export async function getCachedBusiness(businessId?: string): Promise<OfflineBusiness | undefined> {
    const db = await getDB();
    const resolvedBusinessId = resolveBusinessId(businessId);
    if (resolvedBusinessId) {
        return db.get('business', resolvedBusinessId);
    }
    const all = await db.getAll('business');
    return all[0];
}

export async function cacheStore(store: OfflineStore): Promise<void> {
    const db = await getDB();
    await db.put('store', store);
    await updateSyncMeta(`store:${store.businessId}:${store.id}`, new Date().toISOString());
}

export async function getCachedStore(businessId?: string, storeId?: string): Promise<OfflineStore | undefined> {
    const db = await getDB();
    const resolvedBusinessId = resolveBusinessId(businessId);
    if (storeId) {
        const store = await db.get('store', storeId) as OfflineStore | undefined;
        if (!store) return undefined;
        if (resolvedBusinessId && store.businessId !== resolvedBusinessId) return undefined;
        return store;
    }

    const all = await db.getAll('store') as OfflineStore[];
    const scopedStores = all.filter((store) => !resolvedBusinessId || store.businessId === resolvedBusinessId);
    const activeStoreId = await getSyncMeta(getOfflineActiveStoreMetaKey());

    if (activeStoreId) {
        const activeStore = scopedStores.find((store) => store.id === activeStoreId);
        if (activeStore) {
            return activeStore;
        }
    }

    return scopedStores.length === 1 ? scopedStores[0] : undefined;
}

export async function cacheCustomers(businessId: string, customers: OfflineCustomer[]): Promise<void> {
    await clearScopedRecords<OfflineCustomer>('customers', (record) => record.businessId === businessId);

    const db = await getDB();
    const tx = db.transaction('customers', 'readwrite');
    for (const customer of customers) {
        await tx.store.put({ ...customer, businessId });
    }
    await tx.done;

    await updateSyncMeta(`customers:${businessId}`, new Date().toISOString());
}

export async function getCachedCustomers(businessId?: string): Promise<OfflineCustomer[]> {
    const db = await getDB();
    const resolvedBusinessId = resolveBusinessId(businessId);
    const all = await db.getAll('customers') as OfflineCustomer[];
    return resolvedBusinessId
        ? all.filter((customer) => customer.businessId === resolvedBusinessId)
        : all;
}

export async function cacheTills(
    scope: { businessId: string; storeId: string },
    tills: Array<{ id: string; name: string }>
): Promise<void> {
    await clearScopedRecords<OfflineTill>('tills', (record) =>
        record.businessId === scope.businessId && record.storeId === scope.storeId
    );

    const db = await getDB();
    const tx = db.transaction('tills', 'readwrite');
    for (const till of tills) {
        await tx.store.put({ ...till, businessId: scope.businessId, storeId: scope.storeId } satisfies OfflineTill);
    }
    await tx.done;

    await updateSyncMeta(`tills:${scope.businessId}:${scope.storeId}`, new Date().toISOString());
}

export async function getCachedTills(
    businessId?: string,
    storeId?: string
): Promise<OfflineTill[]> {
    const db = await getDB();
    const resolvedBusinessId = resolveBusinessId(businessId);
    const all = await db.getAll('tills') as OfflineTill[];
    return all.filter((till) => {
        if (resolvedBusinessId && till.businessId !== resolvedBusinessId) return false;
        if (storeId && till.storeId !== storeId) return false;
        return true;
    });
}

async function nextLocalSequence(scope: {
    businessId: string;
    tillId: string;
    shiftId?: string | null;
}): Promise<number> {
    const key = `${LOCAL_SEQUENCE_META_PREFIX}${scope.businessId}:${scope.tillId}:${scope.shiftId ?? 'none'}`;
    const current = Number(await getSyncMeta(key)) || 0;
    const next = current + 1;
    await updateSyncMeta(key, String(next));
    return next;
}

export async function queueOfflineSale(
    sale: OfflineSaleCaptureInput | Omit<OfflineSale, 'id' | 'synced'>
): Promise<string> {
    const db = await getDB();
    const id = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const localSaleTime = ('localSaleTime' in sale && sale.localSaleTime) || sale.createdAt || new Date().toISOString();
    const shiftId = 'shiftId' in sale ? sale.shiftId ?? null : null;
    const cashierUserId = 'cashierUserId' in sale ? sale.cashierUserId ?? null : null;
    const localSequence =
        ('localSequence' in sale && sale.localSequence && sale.localSequence > 0)
            ? sale.localSequence
            : await nextLocalSequence({
                businessId: sale.businessId,
                tillId: sale.tillId,
                shiftId,
            });
    const missingShift = !shiftId;
    const status: OfflineSaleQueueStatus =
        sale.status ?? (missingShift ? 'needs_review' : 'pending');

    const offlineSale = migrateQueuedSaleRecord({
        ...sale,
        id,
        shiftId,
        cashierUserId,
        localSaleTime,
        localSequence,
        idempotencyKey: ('idempotencyKey' in sale && sale.idempotencyKey) || id,
        payloadHash: ('payloadHash' in sale && sale.payloadHash) || '',
        synced: false,
        status,
        statusReason: sale.statusReason ?? (missingShift && status === 'needs_review' ? 'missing_shift' : undefined),
    });

    if (!offlineSale.payloadHash) {
        const { hashOfflineSalePayload } = await import('./payload-hash');
        offlineSale.payloadHash = await hashOfflineSalePayload(offlineSale);
    }

    await db.put('salesQueue', offlineSale);
    return id;
}

export async function getPendingSales(businessId?: string): Promise<OfflineSale[]> {
    const db = await getDB();
    const resolvedBusinessId = resolveBusinessId(businessId);
    const all = (await db.getAll('salesQueue') as Array<Partial<OfflineSale>>).map(migrateQueuedSaleRecord);
    return all.filter((sale) => {
        if (resolvedBusinessId && sale.businessId !== resolvedBusinessId) return false;
        if (sale.synced) return false;
        const status = sale.status ?? 'pending';
        return status === 'pending';
    });
}

export async function getReviewSales(businessId?: string): Promise<OfflineSale[]> {
    const db = await getDB();
    const resolvedBusinessId = resolveBusinessId(businessId);
    const all = (await db.getAll('salesQueue') as Array<Partial<OfflineSale>>).map(migrateQueuedSaleRecord);
    return all.filter((sale) => {
        if (resolvedBusinessId && sale.businessId !== resolvedBusinessId) return false;
        return sale.status === 'needs_review' || sale.status === 'rejected';
    });
}

export async function getOfflineSale(id: string, businessId?: string): Promise<OfflineSale | undefined> {
    const db = await getDB();
    const raw = await db.get('salesQueue', id) as Partial<OfflineSale> | undefined;
    if (!raw) return undefined;

    const sale = migrateQueuedSaleRecord(raw);
    const resolvedBusinessId = resolveBusinessId(businessId);
    if (resolvedBusinessId && sale.businessId !== resolvedBusinessId) {
        return undefined;
    }

    return sale;
}

export async function updateOfflineSale(sale: OfflineSale): Promise<void> {
    const db = await getDB();
    await db.put('salesQueue', sale);
}

export async function markSaleSynced(id: string, businessId?: string): Promise<void> {
    const db = await getDB();
    const sale = await db.get('salesQueue', id) as OfflineSale | undefined;
    if (!sale) return;

    const resolvedBusinessId = resolveBusinessId(businessId);
    if (resolvedBusinessId && sale.businessId !== resolvedBusinessId) {
        return;
    }

    sale.synced = true;
    sale.status = 'synced';
    await db.put('salesQueue', migrateQueuedSaleRecord(sale));
}

export async function markSaleQueueStatus(
    id: string,
    status: OfflineSaleQueueStatus,
    reason?: string,
    businessId?: string
): Promise<void> {
    const db = await getDB();
    const raw = await db.get('salesQueue', id) as Partial<OfflineSale> | undefined;
    if (!raw) return;

    const sale = migrateQueuedSaleRecord(raw);
    const resolvedBusinessId = resolveBusinessId(businessId);
    if (resolvedBusinessId && sale.businessId !== resolvedBusinessId) {
        return;
    }

    sale.status = status;
    sale.statusReason = reason;
    sale.synced = status === 'synced' || status === 'already_synced';
    await db.put('salesQueue', sale);
}

export async function removeSyncedSales(businessId?: string): Promise<number> {
    const db = await getDB();
    const resolvedBusinessId = resolveBusinessId(businessId);
    const all = await db.getAll('salesQueue') as OfflineSale[];
    const synced = all.filter((sale) => sale.synced && (!resolvedBusinessId || sale.businessId === resolvedBusinessId));

    const tx = db.transaction('salesQueue', 'readwrite');
    for (const sale of synced) {
        await tx.store.delete(sale.id);
    }
    await tx.done;

    return synced.length;
}

export async function getSyncMeta(key: string): Promise<string | null> {
    const db = await getDB();
    const meta = await db.get('syncMeta', key) as SyncMetaRecord | undefined;
    return meta?.value ?? null;
}

export async function getLastSyncTime(): Promise<string | null> {
    const db = await getDB();
    const all = await db.getAll('syncMeta') as SyncMetaRecord[];
    if (all.length === 0) return null;

    const times = all.map((meta) => meta.updatedAt).filter(Boolean);
    if (times.length === 0) return null;

    times.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return times[0];
}

export async function hasCachedData(scope?: { businessId?: string; storeId?: string }): Promise<boolean> {
    try {
        const products = await getCachedProducts(scope?.businessId, scope?.storeId);
        const business = await getCachedBusiness(scope?.businessId);
        return products.length > 0 && !!business;
    } catch {
        return false;
    }
}

export async function clearOfflineData(businessId?: string): Promise<void> {
    const db = await getDB();
    const resolvedBusinessId = resolveBusinessId(businessId);

    if (!resolvedBusinessId) {
        for (const storeName of STORE_NAMES) {
            const tx = db.transaction(storeName, 'readwrite');
            await tx.store.clear();
            await tx.done;
        }
        return;
    }

    await Promise.all([
        clearScopedRecords<OfflineProduct>('products', (record) => record.businessId === resolvedBusinessId),
        clearScopedRecords<OfflineCustomer>('customers', (record) => record.businessId === resolvedBusinessId),
        clearScopedRecords<OfflineTill>('tills', (record) => record.businessId === resolvedBusinessId),
        clearScopedRecords<OfflineSale>('salesQueue', (record) => record.businessId === resolvedBusinessId),
    ]);

    const stores = await db.getAll('store') as OfflineStore[];
    for (const store of stores) {
        if (store.businessId === resolvedBusinessId) {
            await db.delete('store', store.id);
        }
    }
    await db.delete('business', resolvedBusinessId);
}
