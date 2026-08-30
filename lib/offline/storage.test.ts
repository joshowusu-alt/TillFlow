import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the idb module
vi.mock('idb', () => ({
    openDB: vi.fn(() => Promise.resolve({
        transaction: vi.fn(() => ({
            objectStore: vi.fn(() => ({
                put: vi.fn(() => Promise.resolve()),
                get: vi.fn(() => Promise.resolve(null)),
                getAll: vi.fn(() => Promise.resolve([])),
                clear: vi.fn(() => Promise.resolve()),
                delete: vi.fn(() => Promise.resolve())
            })),
            done: Promise.resolve(),
            store: {
                put: vi.fn(() => Promise.resolve()),
                clear: vi.fn(() => Promise.resolve()),
                delete: vi.fn(() => Promise.resolve())
            }
        })),
        put: vi.fn(() => Promise.resolve()),
        get: vi.fn(() => Promise.resolve(null)),
        getAll: vi.fn(() => Promise.resolve([]))
    }))
}));

describe('Offline Storage Types', () => {
    it('should have correct OfflineProduct interface', () => {
        const product = {
            id: 'test-1',
            name: 'Test Product',
            barcode: '1234567890',
            sellingPriceBasePence: 1000,
            vatRateBps: 2000,
            promoBuyQty: 0,
            promoGetQty: 0,
            onHandBase: 50,
            units: [
                {
                    id: 'unit-1',
                    name: 'piece',
                    pluralName: 'pieces',
                    conversionToBase: 1,
                    isBaseUnit: true
                }
            ]
        };

        expect(product.id).toBe('test-1');
        expect(product.name).toBe('Test Product');
        expect(product.units).toHaveLength(1);
        expect(product.units[0].isBaseUnit).toBe(true);
    });

    it('should have correct OfflineSale interface', () => {
        const sale = {
            id: 'offline-123',
            storeId: 'store-1',
            tillId: 'till-1',
            customerId: null,
            paymentStatus: 'PAID' as const,
            lines: [
                {
                    productId: 'prod-1',
                    unitId: 'unit-1',
                    qtyInUnit: 2,
                    discountType: 'NONE',
                    discountValue: ''
                }
            ],
            payments: [
                { method: 'CASH' as const, amountPence: 2000 }
            ],
            orderDiscountType: 'NONE',
            orderDiscountValue: '',
            createdAt: new Date().toISOString(),
            synced: false
        };

        expect(sale.paymentStatus).toBe('PAID');
        expect(sale.synced).toBe(false);
        expect(sale.lines).toHaveLength(1);
        expect(sale.payments[0].method).toBe('CASH');
    });
});

describe('Sync Utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('isOnline should return navigator.onLine status', async () => {
        const { isOnline } = await import('@/lib/offline/sync');

        // Mock navigator.onLine
        Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
        expect(isOnline()).toBe(true);

        Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
        expect(isOnline()).toBe(false);
    });

    it('setupNetworkListeners should add event listeners', async () => {
        const { setupNetworkListeners } = await import('@/lib/offline/sync');

        const onOnline = vi.fn();
        const onOffline = vi.fn();

        const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

        const cleanup = setupNetworkListeners(onOnline, onOffline);

        expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
        expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

        cleanup();

        expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
        expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    });
});

describe('Offline Sale Queue', () => {
    it('should generate unique IDs for offline sales', () => {
        const id1 = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const id2 = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

        expect(id1).toMatch(/^offline-\d+-[a-z0-9]+$/);
        expect(id1).not.toBe(id2);
    });
});

describe('migrateQueuedSaleRecord', () => {
    it('marks legacy rows without shiftId as needs_review', async () => {
        const { migrateQueuedSaleRecord } = await import('./storage');
        const migrated = migrateQueuedSaleRecord({
            id: 'offline-legacy',
            businessId: 'biz-1',
            storeId: 'store-1',
            tillId: 'till-1',
            customerId: null,
            paymentStatus: 'PAID',
            lines: [],
            payments: [],
            orderDiscountType: 'NONE',
            orderDiscountValue: '',
            createdAt: '2026-01-01T00:00:00.000Z',
            synced: false,
        });

        expect(migrated.shiftId).toBeNull();
        expect(migrated.status).toBe('needs_review');
        expect(migrated.statusReason).toBe('missing_shift');
        expect(migrated.idempotencyKey).toBe('offline-legacy');
        expect(migrated.inventoryPolicy).toBe('enforce');
    });

    it('keeps captured shift rows pending', async () => {
        const { migrateQueuedSaleRecord } = await import('./storage');
        const migrated = migrateQueuedSaleRecord({
            id: 'offline-ok',
            businessId: 'biz-1',
            storeId: 'store-1',
            tillId: 'till-1',
            shiftId: 'shift-1',
            cashierUserId: 'cashier-1',
            customerId: null,
            paymentStatus: 'PAID',
            lines: [],
            payments: [],
            orderDiscountType: 'NONE',
            orderDiscountValue: '',
            createdAt: '2026-01-01T00:00:00.000Z',
            localSaleTime: '2026-01-01T00:00:00.000Z',
            localSequence: 3,
            idempotencyKey: 'idem-1',
            payloadHash: 'abc',
            synced: false,
            status: 'pending',
        });

        expect(migrated.status).toBe('pending');
        expect(migrated.shiftId).toBe('shift-1');
        expect(migrated.localSequence).toBe(3);
    });
});
