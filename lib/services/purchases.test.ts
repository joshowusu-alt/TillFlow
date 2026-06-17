import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, postJournalEntryMock, ensureChartOfAccountsMock } = vi.hoisted(() => ({
  prismaMock: {
    business: { findUnique: vi.fn() },
    store: { findFirst: vi.fn() },
    supplier: { findFirst: vi.fn() },
    product: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    productUnit: { findMany: vi.fn() },
    account: { findMany: vi.fn() },
    purchaseInvoice: { create: vi.fn() },
    purchaseInvoiceLine: { createMany: vi.fn() },
    purchasePayment: { createMany: vi.fn() },
    stockMovement: { createMany: vi.fn() },
    inventoryBalance: { upsert: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  postJournalEntryMock: vi.fn(),
  ensureChartOfAccountsMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/accounting', () => ({
  ACCOUNT_CODES: {
    cash: '1000', bank: '1010', inventory: '1200', ap: '2000',
    cogs: '5000', vatReceivable: '1300',
  },
  postJournalEntry: postJournalEntryMock,
  ensureChartOfAccounts: ensureChartOfAccountsMock,
}));
vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    fetchInventoryMap: vi.fn().mockResolvedValue(new Map()),
    upsertInventoryBalance: vi.fn(),
    incrementInventoryBalance: vi.fn(),
  };
});

import { createPurchase, type PurchaseLineInput } from './purchases';

describe('purchase unit conversion', () => {
  const bizId = 'biz-1';
  const storeId = 'store-1';
  const defaultAccounts = [
    { code: '1000', id: 'acc-cash' },
    { code: '1010', id: 'acc-bank' },
    { code: '1200', id: 'acc-inventory' },
    { code: '1300', id: 'acc-vat-receivable' },
    { code: '2000', id: 'acc-ap' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.business.findUnique.mockResolvedValue({
      id: bizId, vatEnabled: false, currency: 'GHS',
    });
    prismaMock.store.findFirst.mockResolvedValue({ id: storeId });
    prismaMock.supplier.findFirst.mockResolvedValue({ id: 'supplier-a', name: 'Supplier A' });
    prismaMock.product.findMany.mockResolvedValue([]);
    prismaMock.product.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.account.findMany.mockResolvedValue(defaultAccounts);
    prismaMock.$transaction.mockImplementation(async (arg: any) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg(prismaMock);
    });
    prismaMock.purchaseInvoice.create.mockResolvedValue({
      id: 'inv-1', totalPence: 0, lines: [],
    });
    prismaMock.purchaseInvoiceLine.createMany.mockResolvedValue({ count: 1 });
    prismaMock.purchasePayment.createMany.mockResolvedValue({ count: 0 });
    prismaMock.stockMovement.createMany.mockResolvedValue({ count: 1 });
    prismaMock.inventoryBalance.upsert.mockResolvedValue({});
    prismaMock.$executeRaw.mockResolvedValue(1);
    ensureChartOfAccountsMock.mockResolvedValue(undefined);
  });

  it('converts pack qty to base units: 2 packs of 40 = 80 base units', async () => {
    const productId = 'prod-1';
    const packUnitId = 'unit-pack';

    prismaMock.productUnit.findMany.mockResolvedValue([
      {
        productId,
        unitId: packUnitId,
        conversionToBase: 40,
        product: { defaultCostBasePence: 100, vatRateBps: 0 },
        unit: { name: 'Pack' },
      },
    ]);

    const lines: PurchaseLineInput[] = [
      { productId, unitId: packUnitId, qtyInUnit: 2, unitCostPence: 4000 },
    ];

    await createPurchase({
      businessId: bizId,
      storeId,
      paymentStatus: 'PAID',
      payments: [{ method: 'CASH', amountPence: 8000 }],
      lines,
    });

    expect(prismaMock.purchaseInvoice.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.purchaseInvoiceLine.createMany).toHaveBeenCalledTimes(1);
    const createManyCall = prismaMock.purchaseInvoiceLine.createMany.mock.calls[0][0];
    expect(createManyCall.data).toHaveLength(1);
    expect(createManyCall.data[0].qtyBase).toBe(80);
  });

  it('converts single unit qty (conversionToBase=1) correctly', async () => {
    const productId = 'prod-2';
    const pieceUnitId = 'unit-piece';

    prismaMock.productUnit.findMany.mockResolvedValue([
      {
        productId,
        unitId: pieceUnitId,
        conversionToBase: 1,
        product: { defaultCostBasePence: 50, vatRateBps: 0 },
        unit: { name: 'Piece' },
      },
    ]);

    const lines: PurchaseLineInput[] = [
      { productId, unitId: pieceUnitId, qtyInUnit: 50, unitCostPence: 50 },
    ];

    await createPurchase({
      businessId: bizId,
      storeId,
      paymentStatus: 'PAID',
      payments: [{ method: 'CASH', amountPence: 2500 }],
      lines,
    });

    expect(prismaMock.purchaseInvoiceLine.createMany).toHaveBeenCalledTimes(1);
    const createManyCall = prismaMock.purchaseInvoiceLine.createMany.mock.calls[0][0];
    expect(createManyCall.data[0].qtyBase).toBe(50);
  });

  it('throws when qty is zero or negative', async () => {
    prismaMock.productUnit.findMany.mockResolvedValue([
      {
        productId: 'prod-1',
        unitId: 'unit-1',
        conversionToBase: 10,
        product: { defaultCostBasePence: 100, vatRateBps: 0 },
        unit: { name: 'Box' },
      },
    ]);

    await expect(
      createPurchase({
        businessId: bizId,
        storeId,
        paymentStatus: 'PAID',
        payments: [],
        lines: [{ productId: 'prod-1', unitId: 'unit-1', qtyInUnit: 0 }],
      })
    ).rejects.toThrow('Quantity must be at least 1');
  });

  it('throws when unit not configured for product', async () => {
    prismaMock.productUnit.findMany.mockResolvedValue([]);

    await expect(
      createPurchase({
        businessId: bizId,
        storeId,
        paymentStatus: 'PAID',
        payments: [],
        lines: [{ productId: 'prod-1', unitId: 'unit-bad', qtyInUnit: 5 }],
      })
    ).rejects.toThrow('Unit not configured for product');
  });

  it('throws when payment exceeds total', async () => {
    prismaMock.productUnit.findMany.mockResolvedValue([
      {
        productId: 'prod-1',
        unitId: 'unit-1',
        conversionToBase: 1,
        product: { defaultCostBasePence: 100, vatRateBps: 0 },
        unit: { name: 'Piece' },
      },
    ]);

    await expect(
      createPurchase({
        businessId: bizId,
        storeId,
        paymentStatus: 'PAID',
        payments: [{ method: 'CASH', amountPence: 999999 }],
        lines: [{ productId: 'prod-1', unitId: 'unit-1', qtyInUnit: 1, unitCostPence: 100 }],
      })
    ).rejects.toThrow('Payment exceeds total due');
  });

  it('uses configured unit default cost when line cost is omitted', async () => {
    const productId = 'prod-3';
    const quarterPackUnitId = 'unit-quarter-pack';

    prismaMock.productUnit.findMany.mockResolvedValue([
      {
        productId,
        unitId: quarterPackUnitId,
        conversionToBase: 6,
        defaultCostPence: 525,
        product: { defaultCostBasePence: 100, vatRateBps: 0 },
        unit: { name: 'Quarter pack' },
      },
    ]);

    await createPurchase({
      businessId: bizId,
      storeId,
      paymentStatus: 'PAID',
      payments: [{ method: 'CASH', amountPence: 1050 }],
      lines: [{ productId, unitId: quarterPackUnitId, qtyInUnit: 2 }],
    });

    const createManyCall = prismaMock.purchaseInvoiceLine.createMany.mock.calls[0][0];
    expect(createManyCall.data[0].unitCostPence).toBe(525);
    expect(createManyCall.data[0].lineSubtotalPence).toBe(1050);
  });

  it('links unassigned purchased products to the invoice supplier', async () => {
    prismaMock.productUnit.findMany.mockResolvedValue([
      {
        productId: 'prod-1',
        unitId: 'unit-piece',
        conversionToBase: 1,
        product: { defaultCostBasePence: 100, sellingPriceBasePence: 200, vatRateBps: 0 },
        unit: { name: 'Piece' },
      },
    ]);
    prismaMock.product.findMany.mockResolvedValue([{ id: 'prod-1', preferredSupplierId: null }]);
    prismaMock.product.updateMany.mockResolvedValue({ count: 1 });

    const invoice = await createPurchase({
      businessId: bizId,
      storeId,
      supplierId: 'supplier-a',
      paymentStatus: 'PAID',
      payments: [{ method: 'CASH', amountPence: 100 }],
      lines: [{ productId: 'prod-1', unitId: 'unit-piece', qtyInUnit: 1, unitCostPence: 100 }],
    });

    expect(prismaMock.product.updateMany).toHaveBeenCalledWith({
      where: {
        businessId: bizId,
        id: { in: ['prod-1'] },
        preferredSupplierId: null,
      },
      data: { preferredSupplierId: 'supplier-a' },
    });
    expect((invoice as any).supplierProductLinkSummary).toEqual({
      linkedCount: 1,
      alreadyLinkedCount: 0,
      skippedDifferentSupplierCount: 0,
      skippedProducts: [],
    });
  });

  it('leaves products already linked to the invoice supplier unchanged', async () => {
    prismaMock.productUnit.findMany.mockResolvedValue([
      {
        productId: 'prod-1',
        unitId: 'unit-piece',
        conversionToBase: 1,
        product: { defaultCostBasePence: 100, sellingPriceBasePence: 200, vatRateBps: 0 },
        unit: { name: 'Piece' },
      },
    ]);
    prismaMock.product.findMany.mockResolvedValue([{ id: 'prod-1', preferredSupplierId: 'supplier-a' }]);

    const invoice = await createPurchase({
      businessId: bizId,
      storeId,
      supplierId: 'supplier-a',
      paymentStatus: 'PAID',
      payments: [{ method: 'CASH', amountPence: 100 }],
      lines: [{ productId: 'prod-1', unitId: 'unit-piece', qtyInUnit: 1, unitCostPence: 100 }],
    });

    expect(prismaMock.product.updateMany).not.toHaveBeenCalled();
    expect((invoice as any).supplierProductLinkSummary).toEqual({
      linkedCount: 0,
      alreadyLinkedCount: 1,
      skippedDifferentSupplierCount: 0,
      skippedProducts: [],
    });
  });

  it('does not overwrite products linked to a different supplier', async () => {
    prismaMock.productUnit.findMany.mockResolvedValue([
      {
        productId: 'prod-1',
        unitId: 'unit-piece',
        conversionToBase: 1,
        product: { defaultCostBasePence: 100, sellingPriceBasePence: 200, vatRateBps: 0 },
        unit: { name: 'Piece' },
      },
    ]);
    prismaMock.product.findMany.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Milo Tin',
        sku: 'MILO-400G',
        preferredSupplierId: 'supplier-b',
        preferredSupplier: { id: 'supplier-b', name: 'Ama Supplies' },
      },
    ]);

    const invoice = await createPurchase({
      businessId: bizId,
      storeId,
      supplierId: 'supplier-a',
      paymentStatus: 'PAID',
      payments: [{ method: 'CASH', amountPence: 100 }],
      lines: [{ productId: 'prod-1', unitId: 'unit-piece', qtyInUnit: 1, unitCostPence: 100 }],
    });

    expect(prismaMock.product.updateMany).not.toHaveBeenCalled();
    expect((invoice as any).supplierProductLinkSummary).toEqual({
      linkedCount: 0,
      alreadyLinkedCount: 0,
      skippedDifferentSupplierCount: 1,
      skippedProducts: [
        {
          productId: 'prod-1',
          productName: 'Milo Tin',
          sku: 'MILO-400G',
          currentSupplierId: 'supplier-b',
          currentSupplierName: 'Ama Supplies',
          purchaseSupplierId: 'supplier-a',
          purchaseSupplierName: 'Supplier A',
        },
      ],
    });
  });

  it('links only unassigned products across a multi-product purchase', async () => {
    prismaMock.productUnit.findMany.mockResolvedValue([
      {
        productId: 'prod-1',
        unitId: 'unit-piece',
        conversionToBase: 1,
        product: { defaultCostBasePence: 100, sellingPriceBasePence: 200, vatRateBps: 0 },
        unit: { name: 'Piece' },
      },
      {
        productId: 'prod-2',
        unitId: 'unit-piece',
        conversionToBase: 1,
        product: { defaultCostBasePence: 100, sellingPriceBasePence: 200, vatRateBps: 0 },
        unit: { name: 'Piece' },
      },
      {
        productId: 'prod-3',
        unitId: 'unit-piece',
        conversionToBase: 1,
        product: { defaultCostBasePence: 100, sellingPriceBasePence: 200, vatRateBps: 0 },
        unit: { name: 'Piece' },
      },
    ]);
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'prod-1', preferredSupplierId: null },
      { id: 'prod-2', preferredSupplierId: 'supplier-a' },
      {
        id: 'prod-3',
        name: 'Rice Bag',
        sku: 'RICE-5KG',
        preferredSupplierId: 'supplier-b',
        preferredSupplier: { id: 'supplier-b', name: 'Ama Supplies' },
      },
    ]);
    prismaMock.product.updateMany.mockResolvedValue({ count: 1 });

    const invoice = await createPurchase({
      businessId: bizId,
      storeId,
      supplierId: 'supplier-a',
      paymentStatus: 'PAID',
      payments: [{ method: 'CASH', amountPence: 300 }],
      lines: [
        { productId: 'prod-1', unitId: 'unit-piece', qtyInUnit: 1, unitCostPence: 100 },
        { productId: 'prod-2', unitId: 'unit-piece', qtyInUnit: 1, unitCostPence: 100 },
        { productId: 'prod-3', unitId: 'unit-piece', qtyInUnit: 1, unitCostPence: 100 },
      ],
    });

    expect(prismaMock.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['prod-1'] },
          preferredSupplierId: null,
        }),
      }),
    );
    expect((invoice as any).supplierProductLinkSummary).toEqual({
      linkedCount: 1,
      alreadyLinkedCount: 1,
      skippedDifferentSupplierCount: 1,
      skippedProducts: [
        {
          productId: 'prod-3',
          productName: 'Rice Bag',
          sku: 'RICE-5KG',
          currentSupplierId: 'supplier-b',
          currentSupplierName: 'Ama Supplies',
          purchaseSupplierId: 'supplier-a',
          purchaseSupplierName: 'Supplier A',
        },
      ],
    });
  });

  it('does not attempt supplier-product linking when the purchase has no supplier', async () => {
    prismaMock.productUnit.findMany.mockResolvedValue([
      {
        productId: 'prod-1',
        unitId: 'unit-piece',
        conversionToBase: 1,
        product: { defaultCostBasePence: 100, sellingPriceBasePence: 200, vatRateBps: 0 },
        unit: { name: 'Piece' },
      },
    ]);

    const invoice = await createPurchase({
      businessId: bizId,
      storeId,
      supplierId: null,
      paymentStatus: 'PAID',
      payments: [{ method: 'CASH', amountPence: 100 }],
      lines: [{ productId: 'prod-1', unitId: 'unit-piece', qtyInUnit: 1, unitCostPence: 100 }],
    });

    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
    expect(prismaMock.product.updateMany).not.toHaveBeenCalled();
    expect((invoice as any).supplierProductLinkSummary).toEqual({
      linkedCount: 0,
      alreadyLinkedCount: 0,
      skippedDifferentSupplierCount: 0,
      skippedProducts: [],
    });
  });
});
