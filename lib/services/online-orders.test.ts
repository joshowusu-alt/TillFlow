import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOnlineCheckout,
  createOnlineOrderNumber,
  getStorefrontCatalogPage,
  getOnlineOrderStateForCollectionStatus,
  normalizeStorefrontSlug,
  recordStorefrontEvent,
} from './online-orders';

const prismaMock = vi.hoisted(() => ({
  business: {
    findFirst: vi.fn(),
  },
  onlineOrder: { findUnique: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  inventoryBalance: { updateMany: vi.fn() },
  storefrontCustomer: { findUnique: vi.fn() },
  $transaction: vi.fn(),
  storefrontCategoryMapping: {
    findMany: vi.fn(),
  },
  product: {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  storefrontEvent: {
    create: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/services/storefront-notifications', () => ({ enqueueOrderNotificationSafe: vi.fn().mockResolvedValue(undefined) }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizeStorefrontSlug', () => {
  it('normalizes a business name into a URL-safe slug', () => {
    expect(normalizeStorefrontSlug('  Tish Group Market  ')).toBe('tish-group-market');
  });

  it('removes unsupported characters and trims long slugs', () => {
    expect(normalizeStorefrontSlug('***Big & Busy Store!!!***')).toBe('big-busy-store');
  });
});

describe('createOnlineOrderNumber', () => {
  it('creates a stable web order number shape', () => {
    expect(createOnlineOrderNumber(new Date('2026-04-27T12:00:00Z'), 27)).toBe('WEB-20260427-0027');
  });
});

describe('createOnlineCheckout', () => {
  it('blocks checkout when payment details are missing', async () => {
    prismaMock.business.findFirst.mockResolvedValue({
      id: 'biz-1',
      name: 'Test Shop',
      currency: 'GHS',
      vatEnabled: false,
      momoEnabled: true,
      mode: 'ADVANCED',
      plan: 'PRO',
      storeMode: 'MULTI_STORE',
      addonOnlineStorefront: false,
      timezone: 'Africa/Accra',
      storefrontEnabled: true,
      storefrontSlug: 'test-shop',
      storefrontHoursJson: null,
      storefrontPickupPrepMinutes: null,
      storefrontPaymentMode: null,
      storefrontMomoNumber: null,
      storefrontMomoNetwork: null,
      storefrontMerchantShortcode: null,
      storefrontBankName: null,
      storefrontBankAccountName: null,
      storefrontBankAccountNumber: null,
      storefrontBankBranch: null,
      storefrontPaymentNote: null,
      storefrontHeadline: null,
      storefrontDescription: null,
      storefrontPickupInstructions: null,
      storefrontLogoUrl: null,
      storefrontPrimaryColor: null,
      storefrontAccentColor: null,
      storefrontTagline: null,
      phone: null,
      address: null,
      stores: [{ id: 'store-1', name: 'Main', address: null, phone: null }],
    });

    await expect(
      createOnlineCheckout({
        slug: 'test-shop',
        storeId: 'store-1',
        customerName: 'Ama Mensah',
        customerPhone: '0241234567',
        items: [{ productId: 'prod-1', unitId: 'unit-1', qtyInUnit: 1 }],
      }),
    ).rejects.toThrow('This shop is updating its payment details');

    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });
});

describe('getOnlineOrderStateForCollectionStatus', () => {
  it('marks confirmed collections as paid orders', () => {
    expect(getOnlineOrderStateForCollectionStatus('CONFIRMED')).toEqual({
      status: 'PAID',
      paymentStatus: 'PAID',
    });
  });

  it('marks failed or timed out collections as payment failures', () => {
    expect(getOnlineOrderStateForCollectionStatus('FAILED')).toEqual({
      status: 'PAYMENT_FAILED',
      paymentStatus: 'FAILED',
    });
    expect(getOnlineOrderStateForCollectionStatus('TIMEOUT')).toEqual({
      status: 'PAYMENT_FAILED',
      paymentStatus: 'FAILED',
    });
  });
});

describe('recordStorefrontEvent', () => {
  it('derives the business from the storefront slug before writing analytics', async () => {
    prismaMock.business.findFirst.mockResolvedValue({ id: 'biz-1' });
    prismaMock.product.findFirst.mockResolvedValue({ id: 'product-1' });
    prismaMock.storefrontEvent.create.mockResolvedValue({ id: 'event-1' });

    await recordStorefrontEvent({
      storeSlug: 'The Shop',
      eventType: 'product_view',
      productId: 'product-1',
      sessionId: 'session-1',
      metadata: { source: 'test' },
    });

    expect(prismaMock.business.findFirst).toHaveBeenCalledWith({
      where: {
        storefrontSlug: 'the-shop',
        storefrontEnabled: true,
      },
      select: { id: true },
    });
    expect(prismaMock.storefrontEvent.create).toHaveBeenCalledWith({
      data: {
        businessId: 'biz-1',
        storeSlug: 'the-shop',
        eventType: 'product_view',
        productId: 'product-1',
        sessionId: 'session-1',
        metadata: JSON.stringify({ source: 'test' }),
      },
    });
  });

  it('does not write analytics when a supplied business id does not match the slug', async () => {
    prismaMock.business.findFirst.mockResolvedValue(null);

    await recordStorefrontEvent({
      businessId: 'spoofed-biz',
      storeSlug: 'real-shop',
      eventType: 'view',
      sessionId: 'session-1',
    });

    expect(prismaMock.business.findFirst).toHaveBeenCalledWith({
      where: {
        storefrontSlug: 'real-shop',
        storefrontEnabled: true,
        id: 'spoofed-biz',
      },
      select: { id: true },
    });
    expect(prismaMock.storefrontEvent.create).not.toHaveBeenCalled();
  });
});

describe('getStorefrontCatalogPage', () => {
  it('uses database skip/take pagination when category mappings do not require in-memory filtering', async () => {
    prismaMock.business.findFirst.mockResolvedValue({
      id: 'biz-1',
      name: 'Test Shop',
      currency: 'GHS',
      vatEnabled: false,
      momoEnabled: true,
      mode: 'ADVANCED',
      plan: 'PRO',
      storeMode: 'MULTI_STORE',
      addonOnlineStorefront: false,
      storefrontEnabled: true,
      storefrontSlug: 'test-shop',
      storefrontHeadline: null,
      storefrontDescription: null,
      storefrontPickupInstructions: null,
      phone: null,
      address: null,
      stores: [{ id: 'store-1', name: 'Main', address: null, phone: null }],
    });
    prismaMock.storefrontCategoryMapping.findMany.mockResolvedValue([]);
    prismaMock.product.findMany.mockResolvedValue([]);
    prismaMock.product.count.mockResolvedValue(120);

    const page = await getStorefrontCatalogPage('test-shop', { offset: 48, limit: 24 });

    expect(page).toEqual({ products: [], total: 120, offset: 48, limit: 24 });
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 48,
        take: 24,
      }),
    );
    expect(prismaMock.product.count).toHaveBeenCalledWith({
      where: {
        businessId: 'biz-1',
        active: true,
        storefrontPublished: true,
      },
    });
  });
});


describe('durable checkout retry', () => {
  const input = { slug: 'retry-shop', storeId: 'store-1', customerName: 'Ama', customerPhone: '0241234567',
    checkoutKey: '11111111-1111-4111-8111-111111111111', items: [{ productId: 'p1', unitId: 'u1', qtyInUnit: 1 }] };
  beforeEach(() => {
    prismaMock.business.findFirst.mockResolvedValue({ id: 'biz-1', name: 'Shop', storefrontSlug: 'retry-shop',
      storefrontEnabled: true, plan: 'PRO', storeMode: 'SINGLE_STORE', currency: 'GHS', vatEnabled: false,
      storefrontPaymentMode: 'MOMO_NUMBER', storefrontMomoNumber: '0241234567', storefrontMomoNetwork: 'MTN',
      stores: [{ id: 'store-1' }] });
    prismaMock.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Rice', sellingPriceBasePence: 1000, vatRateBps: 0,
      productUnits: [{ unitId: 'u1', conversionToBase: 1, sellingPricePence: 1000, unit: { id: 'u1', name: 'Piece' } }] }]);
    prismaMock.onlineOrder.findUnique.mockResolvedValue(null);
    prismaMock.onlineOrder.findFirst.mockResolvedValue(null);
    prismaMock.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.storefrontCustomer.findUnique.mockResolvedValue(null);
    prismaMock.onlineOrder.create.mockImplementation(async ({ data }: any) => ({ ...data, id: 'order-1' }));
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  });
  it('returns the original order after a lost checkout response without reserving stock again', async () => {
    const first = await createOnlineCheckout(input);
    const saved = prismaMock.onlineOrder.create.mock.calls[0][0].data;
    prismaMock.onlineOrder.findUnique.mockResolvedValue({ ...saved, id: 'order-1' });
    expect(await createOnlineCheckout(input)).toEqual(first);
    expect(prismaMock.inventoryBalance.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.onlineOrder.create).toHaveBeenCalledTimes(1);
    await expect(createOnlineCheckout({ ...input, items: [{ ...input.items[0], qtyInUnit: 2 }] })).rejects.toThrow('different basket');
  });
});
