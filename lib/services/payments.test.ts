import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentInput } from './shared';

const { prismaMock, postJournalEntryMock } = vi.hoisted(() => ({
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
    },
    $transaction: vi.fn(),
  },
  postJournalEntryMock: vi.fn(),
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

import { recordCustomerPayment, recordSupplierPayment } from './payments';

describe('payments service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
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
      include: { payments: true },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.purchasePayment.createMany).toHaveBeenCalledTimes(1);
    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 'purchase-1' });
  });
});
