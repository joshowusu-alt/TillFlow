import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  postJournalEntryMock,
  ensureChartOfAccountsMock,
  recordCashDrawerEntryTxMock,
} = vi.hoisted(() => ({
  prismaMock: {
    business: { findUnique: vi.fn() },
    store: { findFirst: vi.fn() },
    supplier: { findFirst: vi.fn() },
    product: { findMany: vi.fn(), updateMany: vi.fn() },
    productUnit: { findMany: vi.fn() },
    account: { findMany: vi.fn() },
    purchaseInvoice: { create: vi.fn() },
    purchaseInvoiceLine: { createMany: vi.fn() },
    purchasePayment: { create: vi.fn() },
    shift: { findFirst: vi.fn(), update: vi.fn() },
    stockMovement: { createMany: vi.fn() },
    inventoryBalance: { upsert: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  postJournalEntryMock: vi.fn(),
  ensureChartOfAccountsMock: vi.fn(),
  recordCashDrawerEntryTxMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/accounting', () => ({
  ACCOUNT_CODES: {
    cash: '1000',
    bank: '1010',
    inventory: '1200',
    ap: '2000',
    vatReceivable: '1300',
  },
  postJournalEntry: postJournalEntryMock,
  ensureChartOfAccounts: ensureChartOfAccountsMock,
}));
vi.mock('./cash-drawer', async () => {
  const actual = await vi.importActual<typeof import('./cash-drawer')>('./cash-drawer');
  return {
    ...actual,
    recordCashDrawerEntryTx: recordCashDrawerEntryTxMock,
  };
});
vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    fetchInventoryMap: vi.fn().mockResolvedValue(new Map()),
    incrementInventoryBalance: vi.fn(),
  };
});

import { createPurchase } from './purchases';
import { findOrphanCashPurchasePayments, summarizeCashDrawerEntries } from './cash-drawer';

const bizId = 'biz-1';
const storeId = 'store-1';
const userId = 'user-1';
const productLine = {
  productId: 'prod-1',
  unitId: 'unit-piece',
  qtyInUnit: 1,
  unitCostPence: 229800,
};

describe('purchase invoice cash drawer linkage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.business.findUnique.mockResolvedValue({
      id: bizId,
      vatEnabled: false,
      currency: 'GHS',
    });
    prismaMock.store.findFirst.mockResolvedValue({ id: storeId });
    prismaMock.supplier.findFirst.mockResolvedValue({ id: 'supplier-accra', name: 'ACCRA GOODS' });
    prismaMock.product.findMany.mockResolvedValue([]);
    prismaMock.product.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.account.findMany.mockResolvedValue([
      { code: '1000', id: 'acc-cash' },
      { code: '1010', id: 'acc-bank' },
      { code: '1200', id: 'acc-inventory' },
      { code: '2000', id: 'acc-ap' },
    ]);
    prismaMock.productUnit.findMany.mockResolvedValue([
      {
        productId: 'prod-1',
        unitId: 'unit-piece',
        conversionToBase: 1,
        product: { defaultCostBasePence: 100000, sellingPriceBasePence: 250000, vatRateBps: 0 },
        unit: { name: 'Piece' },
      },
    ]);
    prismaMock.purchaseInvoice.create.mockResolvedValue({ id: 'inv-accra', totalPence: 229800 });
    prismaMock.purchaseInvoiceLine.createMany.mockResolvedValue({ count: 1 });
    prismaMock.purchasePayment.create.mockImplementation(async ({ data }: any) => ({
      id: 'payment-accra-cash',
      ...data,
    }));
    prismaMock.shift.findFirst.mockResolvedValue({ id: 'shift-1', tillId: 'till-1' });
    prismaMock.stockMovement.createMany.mockResolvedValue({ count: 1 });
    prismaMock.$executeRaw.mockResolvedValue(1);
    // Production code uses both Prisma $transaction forms: the interactive
    // callback form (fn(tx) => ...) and the sequential array form
    // ($transaction([...promises])) used by the SQLite inventory-upsert
    // fallback in purchases.ts. Support both here.
    prismaMock.$transaction.mockImplementation(async (arg: any) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg(prismaMock);
    });
    recordCashDrawerEntryTxMock.mockResolvedValue({
      entry: { id: 'drawer-out-1' },
      shiftId: 'shift-1',
      beforeExpectedCashPence: 1000000,
      afterExpectedCashPence: 770200,
    });
    ensureChartOfAccountsMock.mockResolvedValue(undefined);
  });

  it('creates PAID/CASH purchase payment with recordedBy and supplier drawer entry', async () => {
    await createPurchase({
      businessId: bizId,
      storeId,
      supplierId: 'supplier-accra',
      paymentStatus: 'PAID',
      payments: [{ method: 'CASH', amountPence: 229800 }],
      lines: [productLine],
      userId,
    });

    // 2 calls: (1) the interactive transaction wrapping invoice + payment +
    // drawer entry creation, and (2) the SQLite inventory-upsert batch
    // fallback, which uses the sequential array form of $transaction.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(prismaMock.purchasePayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purchaseInvoiceId: 'inv-accra',
        method: 'CASH',
        amountPence: 229800,
        recordedByUserId: userId,
      }),
    });
    expect(recordCashDrawerEntryTxMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        businessId: bizId,
        storeId,
        tillId: 'till-1',
        shiftId: 'shift-1',
        createdByUserId: userId,
        entryType: 'PAID_OUT_SUPPLIER',
        amountPence: -229800,
        referenceType: 'PURCHASE_PAYMENT',
        referenceId: 'payment-accra-cash',
        reason: 'Cash paid to supplier: ACCRA GOODS',
      }),
    );
  });

  it('auto-created PAID invoice cash payment also links to the cash drawer', async () => {
    await createPurchase({
      businessId: bizId,
      storeId,
      supplierId: 'supplier-accra',
      paymentStatus: 'PAID',
      payments: [],
      lines: [productLine],
      userId,
    });

    expect(prismaMock.purchasePayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        method: 'CASH',
        amountPence: 229800,
        recordedByUserId: userId,
      }),
    });
    expect(recordCashDrawerEntryTxMock).toHaveBeenCalledTimes(1);
  });

  it('fails clearly when no open shift exists for cash purchase payment', async () => {
    prismaMock.shift.findFirst.mockResolvedValue(null);

    await expect(
      createPurchase({
        businessId: bizId,
        storeId,
        supplierId: 'supplier-accra',
        paymentStatus: 'PAID',
        payments: [{ method: 'CASH', amountPence: 229800 }],
        lines: [productLine],
        userId,
      }),
    ).rejects.toThrow('Open shift is required before recording cash supplier payments.');

    expect(prismaMock.purchasePayment.create).not.toHaveBeenCalled();
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
  });

  it('does not create drawer entries for non-cash purchase payments', async () => {
    await createPurchase({
      businessId: bizId,
      storeId,
      supplierId: 'supplier-accra',
      paymentStatus: 'PART_PAID',
      payments: [{ method: 'TRANSFER', amountPence: 229800 }],
      lines: [productLine],
      userId,
    });

    expect(prismaMock.purchasePayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        method: 'TRANSFER',
        recordedByUserId: userId,
      }),
    });
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
    expect(prismaMock.shift.findFirst).not.toHaveBeenCalled();
  });

  it('creates drawer entries only for CASH lines in mixed payments', async () => {
    prismaMock.purchasePayment.create
      .mockResolvedValueOnce({ id: 'payment-cash', method: 'CASH', amountPence: 100000 })
      .mockResolvedValueOnce({ id: 'payment-transfer', method: 'TRANSFER', amountPence: 129800 });

    await createPurchase({
      businessId: bizId,
      storeId,
      supplierId: 'supplier-accra',
      paymentStatus: 'PAID',
      payments: [
        { method: 'CASH', amountPence: 100000 },
        { method: 'TRANSFER', amountPence: 129800 },
      ],
      lines: [productLine],
      userId,
    });

    expect(recordCashDrawerEntryTxMock).toHaveBeenCalledTimes(1);
    expect(recordCashDrawerEntryTxMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        amountPence: -100000,
        referenceId: 'payment-cash',
      }),
    );
  });

  it('rolls back when drawer entry creation fails', async () => {
    recordCashDrawerEntryTxMock.mockRejectedValue(new Error('drawer write failed'));
    prismaMock.$transaction.mockImplementation(async (arg: any) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg(prismaMock);
    });

    await expect(
      createPurchase({
        businessId: bizId,
        storeId,
        supplierId: 'supplier-accra',
        paymentStatus: 'PAID',
        payments: [{ method: 'CASH', amountPence: 229800 }],
        lines: [productLine],
        userId,
      }),
    ).rejects.toThrow('drawer write failed');
  });

  it('reports supplier payment in drawer totals and not in adjustments', () => {
    const summary = summarizeCashDrawerEntries([
      { entryType: 'OPEN_FLOAT', amountPence: 30000 },
      { entryType: 'CASH_SALE', amountPence: 943350 },
      { entryType: 'PAID_OUT_SUPPLIER', amountPence: -229800 },
      { entryType: 'CASH_ADJUSTMENT', amountPence: 1114800 },
      { entryType: 'CASH_REFUND', amountPence: -7000 },
    ]);

    expect(summary.byType.PAID_OUT_SUPPLIER).toBe(-229800);
    expect(summary.byType.CASH_ADJUSTMENT).toBe(1114800);
    expect(summary.byType.PAID_OUT_SUPPLIER).not.toBe(summary.byType.CASH_ADJUSTMENT);
  });

  it('detects orphan cash purchase payments missing drawer entries', () => {
    const orphans = findOrphanCashPurchasePayments(
      [
        { id: 'pay-1', method: 'CASH', amountPence: 229800 },
        { id: 'pay-2', method: 'TRANSFER', amountPence: 50000 },
        { id: 'pay-3', method: 'CASH', amountPence: 38000 },
      ],
      [
        {
          entryType: 'PAID_OUT_SUPPLIER',
          referenceType: 'PURCHASE_PAYMENT',
          referenceId: 'pay-3',
        },
      ],
    );

    expect(orphans.map((payment) => payment.id)).toEqual(['pay-1']);
  });
});
