import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, postJournalEntryMock, ensureChartOfAccountsMock } = vi.hoisted(() => ({
  prismaMock: {
    business: { findUnique: vi.fn() },
    store: { findFirst: vi.fn() },
    supplier: { findFirst: vi.fn() },
    product: { findFirst: vi.fn() },
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
});
