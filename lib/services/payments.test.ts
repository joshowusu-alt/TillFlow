import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentInput } from './shared';

const { prismaMock, postJournalEntryMock, recordCashDrawerEntryTxMock, getOpenShiftForTillMock } = vi.hoisted(() => ({
  prismaMock: {
    salesInvoice: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    purchaseInvoice: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    salesPayment: {
      createMany: vi.fn(),
    },
    purchasePayment: {
      createMany: vi.fn(),
      create: vi.fn(),
    },
    shift: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  postJournalEntryMock: vi.fn(),
  recordCashDrawerEntryTxMock: vi.fn(),
  getOpenShiftForTillMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('@/lib/accounting', () => ({
  ACCOUNT_CODES: {
    cash: '1000',
    bank: '1010',
    ar: '1100',
    ap: '2000',
  },
  postJournalEntry: postJournalEntryMock,
}));

vi.mock('./cash-drawer', () => ({
  getOpenShiftForTill: getOpenShiftForTillMock,
  recordCashDrawerEntryTx: recordCashDrawerEntryTxMock,
}));

import { recordCustomerPayment, recordSupplierPayment } from './payments';

describe('payments service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
    prismaMock.purchasePayment.create.mockImplementation(async ({ data }: any) => ({
      id: `purchase-payment-${data.method.toLowerCase()}`,
      ...data,
    }));
  });

  it('rejects overpayment before writing customer payments', async () => {
    prismaMock.salesInvoice.findFirst.mockResolvedValue({
      id: 'sale-1',
      businessId: 'biz-1',
      totalPence: 10000,
      payments: [{ amountPence: 9000 }],
    });

    const payments: PaymentInput[] = [{ method: 'CASH', amountPence: 2000 }];

    await expect(recordCustomerPayment('biz-1', 'sale-1', payments)).rejects.toThrow(
      'Payment exceeds outstanding balance'
    );

    expect(prismaMock.salesPayment.createMany).not.toHaveBeenCalled();
    expect(prismaMock.salesInvoice.update).not.toHaveBeenCalled();
  });

  it('scopes supplier invoice lookup by business and writes inside a transaction', async () => {
    prismaMock.purchaseInvoice.findFirst.mockResolvedValue({
      id: 'purchase-1',
      businessId: 'biz-1',
      totalPence: 10000,
      payments: [{ amountPence: 1000 }],
    });

    prismaMock.purchaseInvoice.update.mockResolvedValue({
      id: 'purchase-1',
      paymentStatus: 'PART_PAID',
      payments: [{ amountPence: 1000 }, { amountPence: 2000 }],
    });

    const payments: PaymentInput[] = [{ method: 'CARD', amountPence: 2000 }];
    const result = await recordSupplierPayment('biz-1', 'purchase-1', payments);

    expect(prismaMock.purchaseInvoice.findFirst).toHaveBeenCalledWith({
      where: { id: 'purchase-1', businessId: 'biz-1' },
      include: {
        payments: true,
        supplier: { select: { id: true, name: true } },
      },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.purchasePayment.create).toHaveBeenCalledTimes(1);
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 'purchase-1' });
  });

  it('records supplier cash payments as negative cash drawer movements', async () => {
    prismaMock.purchaseInvoice.findFirst.mockResolvedValue({
      id: 'purchase-1',
      businessId: 'biz-1',
      storeId: 'store-1',
      totalPence: 320000,
      payments: [],
      supplier: { id: 'supplier-1', name: 'Supplier A' },
    });
    prismaMock.shift.findFirst.mockResolvedValue({ id: 'shift-1', tillId: 'till-1' });
    prismaMock.purchaseInvoice.update.mockResolvedValue({
      id: 'purchase-1',
      paymentStatus: 'PART_PAID',
      payments: [{ amountPence: 50000 }],
    });

    await recordSupplierPayment(
      'biz-1',
      'purchase-1',
      [{ method: 'CASH', amountPence: 50000 }],
      undefined,
      'user-1'
    );

    expect(prismaMock.purchasePayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purchaseInvoiceId: 'purchase-1',
        method: 'CASH',
        amountPence: 50000,
        recordedByUserId: 'user-1',
      }),
    });
    expect(recordCashDrawerEntryTxMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        businessId: 'biz-1',
        storeId: 'store-1',
        tillId: 'till-1',
        shiftId: 'shift-1',
        createdByUserId: 'user-1',
        entryType: 'PAID_OUT_SUPPLIER',
        amountPence: -50000,
        referenceType: 'PURCHASE_PAYMENT',
        referenceId: 'purchase-payment-cash',
      })
    );
    const journalLines = postJournalEntryMock.mock.calls[0][0].lines;
    expect(journalLines).toEqual(
      expect.arrayContaining([
        { accountCode: '2000', debitPence: 50000 },
        { accountCode: '1000', creditPence: 50000 },
      ])
    );
    expect(journalLines.some((line: any) => line.accountCode === '4000')).toBe(false);
  });

  it('does not touch the cash drawer for supplier non-cash payments', async () => {
    prismaMock.purchaseInvoice.findFirst.mockResolvedValue({
      id: 'purchase-1',
      businessId: 'biz-1',
      storeId: 'store-1',
      totalPence: 100000,
      payments: [],
      supplier: { id: 'supplier-1', name: 'Supplier A' },
    });
    prismaMock.purchaseInvoice.update.mockResolvedValue({
      id: 'purchase-1',
      paymentStatus: 'PART_PAID',
      payments: [{ amountPence: 50000 }],
    });

    await recordSupplierPayment(
      'biz-1',
      'purchase-1',
      [{ method: 'MOBILE_MONEY', amountPence: 50000 }],
      undefined,
      'user-1'
    );

    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
    expect(prismaMock.shift.findFirst).not.toHaveBeenCalled();
    const journalLines = postJournalEntryMock.mock.calls[0][0].lines;
    expect(journalLines).toEqual(
      expect.arrayContaining([
        { accountCode: '2000', debitPence: 50000 },
        { accountCode: '1010', creditPence: 50000 },
      ])
    );
    expect(journalLines.some((line: any) => line.accountCode === '4000')).toBe(false);
  });

  it('records customer cash debt collections as cash drawer inflows without revenue', async () => {
    prismaMock.salesInvoice.findFirst.mockResolvedValue({
      id: 'sale-1',
      businessId: 'biz-1',
      storeId: 'store-1',
      tillId: 'invoice-till',
      shiftId: null,
      cashierUserId: 'cashier-1',
      totalPence: 400000,
      payments: [],
    });
    prismaMock.shift.findFirst.mockResolvedValue({ id: 'shift-1', tillId: 'till-1' });
    prismaMock.salesInvoice.update.mockResolvedValue({
      id: 'sale-1',
      paymentStatus: 'PART_PAID',
      payments: [{ amountPence: 200000 }],
    });

    await recordCustomerPayment(
      'biz-1',
      'sale-1',
      [{ method: 'CASH', amountPence: 200000 }],
      'user-1'
    );

    expect(prismaMock.salesPayment.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        salesInvoiceId: 'sale-1',
        method: 'CASH',
        amountPence: 200000,
      })],
    });
    expect(recordCashDrawerEntryTxMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        entryType: 'CASH_DEBTOR_PAYMENT',
        amountPence: 200000,
        tillId: 'till-1',
        shiftId: 'shift-1',
        referenceType: 'SALES_INVOICE',
        referenceId: 'sale-1',
      })
    );
    const journalLines = postJournalEntryMock.mock.calls[0][0].lines;
    expect(journalLines).toEqual(
      expect.arrayContaining([
        { accountCode: '1000', debitPence: 200000 },
        { accountCode: '1100', creditPence: 200000 },
      ])
    );
    expect(journalLines.some((line: any) => line.accountCode === '4000')).toBe(false);
  });

  it('does not touch the cash drawer for customer non-cash debt collections', async () => {
    prismaMock.salesInvoice.findFirst.mockResolvedValue({
      id: 'sale-1',
      businessId: 'biz-1',
      storeId: 'store-1',
      tillId: 'invoice-till',
      shiftId: null,
      cashierUserId: 'cashier-1',
      totalPence: 400000,
      payments: [],
    });
    prismaMock.salesInvoice.update.mockResolvedValue({
      id: 'sale-1',
      paymentStatus: 'PART_PAID',
      payments: [{ amountPence: 200000 }],
    });

    await recordCustomerPayment(
      'biz-1',
      'sale-1',
      [{ method: 'MOBILE_MONEY', amountPence: 200000 }],
      'user-1'
    );

    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
    expect(prismaMock.shift.findFirst).not.toHaveBeenCalled();
    const journalLines = postJournalEntryMock.mock.calls[0][0].lines;
    expect(journalLines).toEqual(
      expect.arrayContaining([
        { accountCode: '1010', debitPence: 200000 },
        { accountCode: '1100', creditPence: 200000 },
      ])
    );
    expect(journalLines.some((line: any) => line.accountCode === '4000')).toBe(false);
  });
});
