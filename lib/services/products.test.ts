import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    product: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    productUnit: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { buildProductUnitCreates, quickCreateProduct } from './products';

describe('product unit configuration helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.product.findFirst.mockResolvedValue(null);
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
});
