import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOnlineCheckout } from '@/lib/services/online-orders';

const prismaMock = vi.hoisted(() => ({
  business: { findFirst: vi.fn(), findUnique: vi.fn() },
  onlineOrder: { findUnique: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  inventoryBalance: { updateMany: vi.fn(), findMany: vi.fn() },
  stockMovement: { createMany: vi.fn() },
  storefrontCustomer: { findUnique: vi.fn(), findFirst: vi.fn() },
  storefrontEvent: { create: vi.fn() },
  product: { findMany: vi.fn() },
  foodDish: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/services/storefront-notifications', () => ({
  enqueueOrderNotificationSafe: vi.fn().mockResolvedValue(undefined),
}));

const bankuDish = {
  productId: 'banku',
  stockMode: 'COUNTED',
  soldOut: false,
  lowAt: 2,
  product: { name: 'Banku', sellingPriceBasePence: 2500 },
  sizes: [],
  inclusions: [{ id: 'bowl', name: 'bowl of banku', qty: 1, stockPortions: 1 }],
  groups: [{
    id: 'extras',
    name: 'Extras',
    selection: 'MANY',
    required: false,
    addons: [{ id: 'extra', name: 'extra banku', pricePence: 500, maxQty: 3, stockPortions: 1, active: true }],
  }],
};

function business(category: string | null) {
  return {
    id: 'biz-1',
    name: 'Check Check',
    businessCategory: category,
    storefrontSlug: 'check-check',
    storefrontEnabled: true,
    plan: 'PRO',
    storeMode: 'SINGLE_STORE',
    currency: 'GHS',
    vatEnabled: false,
    storefrontPaymentMode: 'MOMO_NUMBER',
    storefrontMomoNumber: '0241234567',
    storefrontMomoNetwork: 'MTN',
    stores: [{ id: 'store-1' }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.onlineOrder.findUnique.mockResolvedValue(null);
  prismaMock.onlineOrder.findFirst.mockResolvedValue(null);
  prismaMock.onlineOrder.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: 'order-1' }));
  prismaMock.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.inventoryBalance.findMany.mockResolvedValue([
    { productId: 'banku', qtyOnHandBase: 5, avgCostBasePence: 0, knownValuePence: 0, unvaluedQtyBase: 5 },
    { productId: 'rice', qtyOnHandBase: 4, avgCostBasePence: 100, knownValuePence: 400, unvaluedQtyBase: 0 },
  ]);
  prismaMock.stockMovement.createMany.mockResolvedValue({ count: 1 });
  prismaMock.storefrontCustomer.findUnique.mockResolvedValue(null);
  prismaMock.storefrontCustomer.findFirst.mockResolvedValue(null);
  prismaMock.storefrontEvent.create.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
});

describe('online plate stock hold', () => {
  it('reserves the included bowl and the extra bowl before payment instructions', async () => {
    prismaMock.business.findFirst.mockResolvedValue(business('FOOD_DISHES'));
    prismaMock.foodDish.findMany.mockResolvedValue([bankuDish]);
    prismaMock.product.findMany.mockResolvedValue([{
      id: 'banku',
      name: 'Banku',
      sellingPriceBasePence: 2500,
      vatRateBps: 0,
      imageUrl: null,
      productUnits: [{ unitId: 'plate', conversionToBase: 1, sellingPricePence: null, unit: { id: 'plate', name: 'Plate', pluralName: 'Plates' } }],
    }]);

    await createOnlineCheckout({
      slug: 'check-check',
      storeId: 'store-1',
      customerName: 'Ama',
      customerPhone: '0241234567',
      checkoutKey: '22222222-2222-4222-8222-222222222222',
      items: [{ productId: 'banku', unitId: 'plate', qtyInUnit: 1, plate: { addons: [{ addonId: 'extra', qty: 1 }] } }],
    });

    const saved = prismaMock.onlineOrder.create.mock.calls[0][0].data;
    expect(saved.totalPence).toBe(3000);
    expect(saved.lines.create[0]).toMatchObject({ qtyInUnit: 1, qtyBase: 2, unitPricePence: 3000, lineTotalPence: 3000 });
    const snapshot = JSON.parse(saved.lines.create[0].plateSnapshotJson);
    expect(snapshot.inclusions).toEqual([{ name: 'bowl of banku', qty: 1 }]);
    expect(snapshot.addons[0].name).toBe('extra banku');
    expect(prismaMock.inventoryBalance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ productId: 'banku', qtyOnHandBase: { gte: 2 } }),
      data: expect.objectContaining({ qtyOnHandBase: 3 }),
    }));
    expect(prismaMock.stockMovement.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ type: 'ONLINE_ORDER_RESERVATION', qtyBase: -2, productId: 'banku' })],
    });
  });

  it('rejects an extra with one bowl left but accepts the standard plate', async () => {
    prismaMock.business.findFirst.mockResolvedValue(business('FOOD_DISHES'));
    prismaMock.foodDish.findMany.mockResolvedValue([{ ...bankuDish, inclusions: [] }]);
    prismaMock.product.findMany.mockResolvedValue([{
      id: 'banku', name: 'Banku', sellingPriceBasePence: 2500, vatRateBps: 0,
      productUnits: [{ unitId: 'plate', conversionToBase: 1, unit: { id: 'plate', name: 'Plate' } }],
    }]);
    prismaMock.inventoryBalance.findMany.mockResolvedValue([
      { productId: 'banku', qtyOnHandBase: 1, avgCostBasePence: 0, knownValuePence: 0, unvaluedQtyBase: 1 },
    ]);
    const details = { slug: 'check-check', storeId: 'store-1', customerName: 'Ama', customerPhone: '0241234567' };
    const line = { productId: 'banku', unitId: 'plate', qtyInUnit: 1 };
    await expect(createOnlineCheckout({
      ...details, items: [{ ...line, plate: { addons: [{ addonId: 'extra', qty: 1 }] } }],
    })).rejects.toThrow('out of stock');
    expect(prismaMock.onlineOrder.create).not.toHaveBeenCalled();
    await createOnlineCheckout({ ...details, items: [line] });
    expect(prismaMock.onlineOrder.create.mock.calls[0][0].data.lines.create[0].qtyBase).toBe(1);
  });

  it('does not reserve a dish that is only switched on or off', async () => {
    prismaMock.business.findFirst.mockResolvedValue(business('FOOD_DISHES'));
    prismaMock.foodDish.findMany.mockResolvedValue([{ ...bankuDish, stockMode: 'NOT_COUNTED', soldOut: false }]);
    prismaMock.product.findMany.mockResolvedValue([{
      id: 'banku',
      name: 'Banku',
      sellingPriceBasePence: 2500,
      vatRateBps: 0,
      productUnits: [{ unitId: 'plate', conversionToBase: 1, sellingPricePence: null, unit: { id: 'plate', name: 'Plate', pluralName: 'Plates' } }],
    }]);

    await createOnlineCheckout({
      slug: 'check-check',
      storeId: 'store-1',
      customerName: 'Ama',
      customerPhone: '0241234567',
      items: [{ productId: 'banku', unitId: 'plate', qtyInUnit: 1 }],
    });

    expect(prismaMock.inventoryBalance.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.onlineOrder.create.mock.calls[0][0].data.lines.create[0].qtyBase).toBe(0);
    expect(prismaMock.onlineOrder.create.mock.calls[0][0].data.totalPence).toBe(2500);
  });

  it('keeps a supermarket basket on the catalogue price and a one-unit hold', async () => {
    prismaMock.business.findFirst.mockResolvedValue(business('SUPERMARKET'));
    prismaMock.product.findMany.mockResolvedValue([{
      id: 'rice',
      name: 'Rice',
      sellingPriceBasePence: 1000,
      vatRateBps: 0,
      productUnits: [{ unitId: 'bag', conversionToBase: 1, sellingPricePence: 1000, unit: { id: 'bag', name: 'Bag', pluralName: 'Bags' } }],
    }]);

    await createOnlineCheckout({
      slug: 'check-check',
      storeId: 'store-1',
      customerName: 'Ama',
      customerPhone: '0241234567',
      items: [{
        productId: 'rice',
        unitId: 'bag',
        qtyInUnit: 1,
        plate: { addons: [{ addonId: 'extra', qty: 1 }], expectedPricePence: 100 },
      }],
    });

    expect(prismaMock.foodDish.findMany).not.toHaveBeenCalled();
    const saved = prismaMock.onlineOrder.create.mock.calls[0][0].data;
    expect(saved.totalPence).toBe(1000);
    expect(saved.lines.create[0]).toMatchObject({ qtyBase: 1, unitPricePence: 1000, plateSnapshotJson: null });
    expect(prismaMock.stockMovement.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ productId: 'rice', qtyBase: -1, type: 'ONLINE_ORDER_RESERVATION' })],
    });
  });

  it('keeps a bookshop basket unchanged when a plate payload is sent', async () => {
    prismaMock.business.findFirst.mockResolvedValue(business('OTHER'));
    prismaMock.product.findMany.mockResolvedValue([{
      id: 'rice',
      name: 'Exercise book',
      sellingPriceBasePence: 800,
      vatRateBps: 0,
      productUnits: [{ unitId: 'copy', conversionToBase: 1, sellingPricePence: 800, unit: { id: 'copy', name: 'Copy', pluralName: 'Copies' } }],
    }]);

    await createOnlineCheckout({
      slug: 'check-check',
      storeId: 'store-1',
      customerName: 'Ama',
      customerPhone: '0241234567',
      items: [{ productId: 'rice', unitId: 'copy', qtyInUnit: 2 }],
    });

    expect(prismaMock.foodDish.findMany).not.toHaveBeenCalled();
    expect(prismaMock.onlineOrder.create.mock.calls[0][0].data.totalPence).toBe(1600);
    expect(prismaMock.stockMovement.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ qtyBase: -2, type: 'ONLINE_ORDER_RESERVATION' })],
    });
  });
});
