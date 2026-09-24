import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  fetchInventoryMapMock,
  upsertInventoryBalanceMock,
} = vi.hoisted(() => ({
  prismaMock: {
    salesInvoice: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    stockMovement: {
      createMany: vi.fn(),
    },
    cashDrawerEntry: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    shift: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    journalEntry: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    journalLine: {
      deleteMany: vi.fn(),
    },
    salesPayment: {
      deleteMany: vi.fn(),
    },
    mobileMoneyCollection: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  fetchInventoryMapMock: vi.fn(),
  upsertInventoryBalanceMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    fetchInventoryMap: fetchInventoryMapMock,
    upsertInventoryBalance: upsertInventoryBalanceMock,
  };
});

import { cleanupOwnerVoidedSale } from './owner-sale-cleanup';

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-42',
    businessId: 'biz-1',
    storeId: 'store-1',
    tillId: 'till-1',
    shiftId: 'shift-1',
    cashierUserId: 'cashier-1',
    transactionNumber: 'INV-000042',
    paymentStatus: 'PAID',
    grossMarginPence: 1800,
    cashReceivedPence: 5004,
    changeDuePence: 0,
    salesReturn: null,
    lines: [
      {
        productId: 'prod-1',
        qtyBase: 2,
        product: { defaultCostBasePence: 900 },
      },
    ],
    payments: [
      { id: 'pay-1', method: 'CASH', amountPence: 5004 },
    ],
    ...overrides,
  };
}

describe('cleanupOwnerVoidedSale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
    prismaMock.salesInvoice.findFirst.mockResolvedValue(makeInvoice());
    fetchInventoryMapMock.mockResolvedValue(new Map([['prod-1', { qtyOnHandBase: 10, avgCostBasePence: 900 }]]));
    upsertInventoryBalanceMock.mockResolvedValue(undefined);
    prismaMock.stockMovement.createMany.mockResolvedValue({ count: 1 });
    prismaMock.cashDrawerEntry.findMany
      .mockResolvedValueOnce([
        { id: 'drawer-1', shiftId: 'shift-1', amountPence: 5004, entryType: 'CASH_SALE' },
      ])
      .mockResolvedValueOnce([]);
    prismaMock.cashDrawerEntry.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.shift.findUnique.mockResolvedValue({
      id: 'shift-1',
      status: 'OPEN',
      closedAt: null,
    });
    prismaMock.shift.update.mockResolvedValue({});
    prismaMock.journalEntry.findMany.mockResolvedValue([{ id: 'journal-1' }]);
    prismaMock.journalLine.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.journalEntry.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.salesPayment.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.mobileMoneyCollection.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.salesInvoice.update.mockResolvedValue({});
  });

  it('restores stock and removes accounting/cash impact for a mistaken sale', async () => {
    const result = await cleanupOwnerVoidedSale({ businessId: 'biz-1', salesInvoiceId: 'inv-42' });

    expect(result).toEqual({
      salesInvoiceId: 'inv-42',
      transactionNumber: 'INV-000042',
      removedPaymentCount: 1,
    });

    expect(upsertInventoryBalanceMock).toHaveBeenCalledWith(
      prismaMock,
      'store-1',
      'prod-1',
      12,
      900,
    );

    expect(prismaMock.journalLine.deleteMany).toHaveBeenCalledWith({
      where: { journalEntryId: { in: ['journal-1'] } },
    });
    expect(prismaMock.journalEntry.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['journal-1'] } },
    });
    expect(prismaMock.salesPayment.deleteMany).toHaveBeenCalledWith({
      where: { salesInvoiceId: 'inv-42' },
    });
    expect(prismaMock.cashDrawerEntry.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['drawer-1'] } },
    });
    expect(prismaMock.salesInvoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-42' },
      data: {
        paymentStatus: 'VOID',
        grossMarginPence: 0,
        cashReceivedPence: 0,
        changeDuePence: 0,
      },
    });

    expect(prismaMock.shift.update).toHaveBeenCalledWith({
      where: { id: 'shift-1' },
      data: { expectedCashPence: 0 },
    });
  });

  it('rejects cleanup of a closed shift without rewriting the snapshot', async () => {
    prismaMock.shift.findUnique.mockResolvedValue({
      id: 'shift-1',
      status: 'CLOSED',
      closedAt: new Date('2026-03-17T22:00:00.000Z'),
    });

    await expect(
      cleanupOwnerVoidedSale({ businessId: 'biz-1', salesInvoiceId: 'inv-42' }),
    ).rejects.toThrow('CLOSED_SHIFT_CLEANUP_REJECTED');
    expect(prismaMock.shift.update).not.toHaveBeenCalled();
    expect(prismaMock.cashDrawerEntry.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.salesInvoice.update).not.toHaveBeenCalled();
  });

  it('rejects a sale that is already voided or returned', async () => {
    prismaMock.salesInvoice.findFirst.mockResolvedValue(makeInvoice({ paymentStatus: 'VOID' }));

    await expect(
      cleanupOwnerVoidedSale({ businessId: 'biz-1', salesInvoiceId: 'inv-42' })
    ).rejects.toThrow('Sale already voided or returned');
  });
});
