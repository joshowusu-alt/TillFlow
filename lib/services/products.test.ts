import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    product: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    productUnit: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    inventoryBalance: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    stockMovement: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { buildProductUnitCreates, quickCreateProduct, repairInventoryAverageCostDrift, updateProduct } from './products';

describe('product unit configuration helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.product.findFirst.mockResolvedValue(null);
    prismaMock.product.findMany.mockResolvedValue([]);
    prismaMock.inventoryBalance.findMany.mockResolvedValue([]);
    prismaMock.inventoryBalance.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.stockMovement.findMany.mockResolvedValue([]);
  });

  it('builds base + packaging unit creates only when packaging is valid', () => {
    expect(buildProductUnitCreates('unit-piece', 'unit-carton', 24)).toEqual([
      { unitId: 'unit-piece', isBaseUnit: true, conversionToBase: 1 },
      { unitId: 'unit-carton', isBaseUnit: false, conversionToBase: 24 },
    ]);

    expect(buildProductUnitCreates('unit-piece', 'unit-piece', 24)).toEqual([
      { unitId: 'unit-piece', isBaseUnit: true, conversionToBase: 1 },
    ]);

    expect(buildProductUnitCreates('unit-piece', 'unit-carton', 1)).toEqual([
      { unitId: 'unit-piece', isBaseUnit: true, conversionToBase: 1 },
    ]);
  });

  it('quick-creates products with explicit unit configs and returns override metadata', async () => {
    const dbMock = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      product: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'prod-1',
          name: 'Milk carton',
          barcode: '12345',
          defaultCostBasePence: 220,
          sellingPriceBasePence: 300,
          vatRateBps: 0,
          promoBuyQty: 0,
          promoGetQty: 0,
          productUnits: [
            {
              unitId: 'unit-piece',
              conversionToBase: 1,
              isBaseUnit: true,
              sellingPricePence: null,
              defaultCostPence: null,
              unit: { name: 'piece', pluralName: 'pieces' },
            },
            {
              unitId: 'unit-half-pack',
              conversionToBase: 6,
              isBaseUnit: false,
              sellingPricePence: 1500,
              defaultCostPence: 1100,
              unit: { name: 'half-pack', pluralName: 'half-packs' },
            },
          ],
        }),
      },
    };

    const result = await quickCreateProduct(
      'biz-1',
      {
        name: 'Milk carton',
        barcode: '12345',
        sellingPriceBasePence: 300,
        defaultCostBasePence: 220,
        vatRateBps: 0,
        baseUnitId: 'unit-piece',
        unitConfigs: [
          { unitId: 'unit-piece', conversionToBase: 1, isBaseUnit: true },
          {
            unitId: 'unit-half-pack',
            conversionToBase: 6,
            isBaseUnit: false,
            sellingPricePence: 1500,
            defaultCostPence: 1100,
          },
        ],
      },
      dbMock as any
    );

    expect(dbMock.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productUnits: {
            create: [
              {
                unitId: 'unit-piece',
                isBaseUnit: true,
                conversionToBase: 1,
                sellingPricePence: null,
                defaultCostPence: null,
              },
              {
                unitId: 'unit-half-pack',
                isBaseUnit: false,
                conversionToBase: 6,
                sellingPricePence: 1500,
                defaultCostPence: 1100,
              },
            ],
          },
        }),
      })
    );

    expect(result.units).toEqual([
      {
        id: 'unit-piece',
        name: 'piece',
        pluralName: 'pieces',
        conversionToBase: 1,
        isBaseUnit: true,
        sellingPricePence: null,
        defaultCostPence: null,
      },
      {
        id: 'unit-half-pack',
        name: 'half-pack',
        pluralName: 'half-packs',
        conversionToBase: 6,
        isBaseUnit: false,
        sellingPricePence: 1500,
        defaultCostPence: 1100,
      },
    ]);
  });

  it('rejects invalid unit configs before touching the database', async () => {
    const dbMock = {
      $queryRaw: vi.fn(),
      product: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    };

    await expect(
      quickCreateProduct(
        'biz-1',
        {
          name: 'Broken config',
          sellingPriceBasePence: 100,
          defaultCostBasePence: 50,
          vatRateBps: 0,
          baseUnitId: 'unit-piece',
          unitConfigs: [
            { unitId: 'unit-piece', conversionToBase: 1, isBaseUnit: true },
            { unitId: 'unit-piece', conversionToBase: 12, isBaseUnit: false },
          ],
        },
        dbMock as any
      )
    ).rejects.toThrow('Each unit can only be configured once per product.');

    expect(dbMock.product.create).not.toHaveBeenCalled();
    expect(dbMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('syncs default-cost-managed inventory balances when product cost changes', async () => {
    prismaMock.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      defaultCostBasePence: 1700,
    });
    const txMock = {
      product: { update: vi.fn().mockResolvedValue({}) },
      inventoryBalance: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'balance-1', storeId: 'store-1' },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      stockMovement: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      productUnit: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback) => callback(txMock));

    await updateProduct('prod-1', 'biz-1', {
      name: 'PPP',
      sku: null,
      barcode: null,
      categoryId: null,
      imageUrl: null,
      sellingPriceBasePence: 900,
      defaultCostBasePence: 550,
      minimumMarginThresholdBps: null,
      vatRateBps: 0,
      promoBuyQty: 0,
      promoGetQty: 0,
      baseUnitId: 'unit-piece',
      packagingUnitId: '',
      packagingConversion: 0,
      unitConfigs: [{ unitId: 'unit-piece', conversionToBase: 1, isBaseUnit: true }],
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.inventoryBalance.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['balance-1'] } },
      data: { avgCostBasePence: 550 },
    });
  });

  it('does not override balances with authoritative inbound cost history during drift repair', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'prod-1', defaultCostBasePence: 550, productUnits: [] },
    ]);
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        inventoryBalance: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'balance-1', storeId: 'store-1' },
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        stockMovement: {
          findMany: vi.fn().mockResolvedValue([{ storeId: 'store-1' }]),
        },
      })
    );

    const result = await repairInventoryAverageCostDrift('biz-1');

    expect(result).toEqual({
      affectedProducts: 0,
      syncedBalances: 0,
      skippedAuthoritativeBalances: 1,
      repairedPackageCostBalances: 0,
    });
  });

  it('repairs package cost accidentally stored as base average cost even with inbound history', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      {
        id: 'prod-1',
        defaultCostBasePence: 290,
        productUnits: [
          { isBaseUnit: true, conversionToBase: 1, defaultCostPence: null },
          { isBaseUnit: false, conversionToBase: 20, defaultCostPence: null },
        ],
      },
    ]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        inventoryBalance: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'balance-1', storeId: 'store-1', avgCostBasePence: 5800 },
          ]),
          updateMany,
        },
        stockMovement: {
          findMany: vi.fn().mockResolvedValue([{ storeId: 'store-1' }]),
        },
      })
    );

    const result = await repairInventoryAverageCostDrift('biz-1');

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['balance-1'] } },
      data: { avgCostBasePence: 290 },
    });
    expect(result).toEqual({
      affectedProducts: 1,
      syncedBalances: 1,
      skippedAuthoritativeBalances: 0,
      repairedPackageCostBalances: 1,
    });
  });
});
