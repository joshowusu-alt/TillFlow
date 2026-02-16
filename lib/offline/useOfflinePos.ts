'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    isOnline,
    cacheProducts,
    cacheBusiness,
    cacheStore,
    cacheCustomers,
    cacheTills,
    getCachedProducts,
    getCachedBusiness,
    getCachedStore,
    getCachedCustomers,
    getCachedTills,
    queueOfflineSale,
    hasCachedData,
    type OfflineProduct,
    type OfflineBusiness,
    type OfflineStore,
    type OfflineCustomer
} from '@/lib/offline';

export interface UseOfflinePosOptions {
    products: OfflineProduct[];
    business: OfflineBusiness;
    store: OfflineStore;
    customers: OfflineCustomer[];
    tills: Array<{ id: string; name: string }>;
}

export interface UseOfflinePosResult {
    isOffline: boolean;
    products: OfflineProduct[];
    business: OfflineBusiness | null;
    store: OfflineStore | null;
    customers: OfflineCustomer[];
    tills: Array<{ id: string; name: string }>;
    ready: boolean;
    queueSale: (sale: {
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
    }) => Promise<string>;
}

export function useOfflinePos(options: UseOfflinePosOptions): UseOfflinePosResult {
    const [offline, setOffline] = useState(false);
    const [ready, setReady] = useState(false);
    const [cachedProducts, setCachedProducts] = useState<OfflineProduct[]>([]);
    const [cachedBusiness, setCachedBusiness] = useState<OfflineBusiness | null>(null);
    const [cachedStore, setCachedStore] = useState<OfflineStore | null>(null);
    const [cachedCustomers, setCachedCustomers] = useState<OfflineCustomer[]>([]);
    const [cachedTills, setCachedTills] = useState<Array<{ id: string; name: string }>>([]);

    // Initialize: cache data and load from cache if offline
    useEffect(() => {
        const init = async () => {
            const online = isOnline();
            setOffline(!online);

            if (online) {
                // Online: cache the server data for later use
                try {
                    await Promise.all([
                        cacheProducts(options.products),
                        cacheBusiness(options.business),
                        cacheStore(options.store),
                        cacheCustomers(options.customers),
                        cacheTills(options.tills)
                    ]);
                } catch (error) {
                    console.error('Failed to cache data:', error);
                }
                setReady(true);
            } else {
                // Offline: load from cache
                try {
                    const hasCache = await hasCachedData();
                    if (hasCache) {
                        const [products, business, store, customers, tills] = await Promise.all([
                            getCachedProducts(),
                            getCachedBusiness(),
                            getCachedStore(),
                            getCachedCustomers(),
                            getCachedTills()
                        ]);
                        setCachedProducts(products);
                        setCachedBusiness(business ?? null);
                        setCachedStore(store ?? null);
                        setCachedCustomers(customers);
                        setCachedTills(tills);
                    }
                } catch (error) {
                    console.error('Failed to load cached data:', error);
                }
                setReady(true);
            }
        };

        init();
    }, [options.products, options.business, options.store, options.customers, options.tills]);

    // Listen for online/offline changes
    useEffect(() => {
        const handleOnline = () => setOffline(false);
        const handleOffline = () => setOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Queue a sale for offline sync
    const queueSale = useCallback(async (sale: {
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
    }) => {
        const id = await queueOfflineSale({
            ...sale,
            createdAt: new Date().toISOString()
        });

        // Update local inventory for the cached products
        if (offline) {
            const updatedProducts = [...(offline ? cachedProducts : options.products)];
            for (const line of sale.lines) {
                const product = updatedProducts.find((p) => p.id === line.productId);
                if (product) {
                    const unit = product.units.find((u) => u.id === line.unitId);
                    if (unit) {
                        product.onHandBase -= line.qtyInUnit * unit.conversionToBase;
                    }
                }
            }
            setCachedProducts(updatedProducts);
            await cacheProducts(updatedProducts);
        }

        return id;
    }, [offline, cachedProducts, options.products]);

    // Return appropriate data based on online/offline status
    return {
        isOffline: offline,
        products: offline ? cachedProducts : options.products,
        business: offline ? cachedBusiness : options.business,
        store: offline ? cachedStore : options.store,
        customers: offline ? cachedCustomers : options.customers,
        tills: offline ? cachedTills : options.tills,
        ready,
        queueSale
    };
}
