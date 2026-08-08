import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentInput } from './shared';

const { prismaMock, postJournalEntryMock, recordCashDrawerEntryTxMock } = vi.hoisted(() => ({
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
      findUnique: vi.fn(),
    },
    shift: {
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  postJournalEntryMock: vi.fn(),
  recordCashDrawerEntryTxMock: vi.fn(),
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

vi.mock('./cash-drawer', async () => {
  const actual = await vi.importActual<typeof import('./cash-drawer')>('./cash-drawer');
  return {
    ...actual,
    recordCashDrawerEntryTx: recordCashDrawerEntryTxMock,
  };
});

import {
  recordCustomerPayment,
  recordSupplierPayment,
  SupplierPaymentError,
  SUPPLIER_PAYMENT_ERROR,
} from './payments';

const ownerOpts = {
  recordedByUserId: 'user-1',
  actorRole: 'OWNER',
  actorName: 'Owner',
  idempotencyKey: 'idem-1',
};

describe('payments service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
    prismaMock.purchasePayment.findUnique.mockResolvedValue(null);
    prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-1' });
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
      supplier: { id: 'supplier-1', name: 'Supplier A' },
    });

    prismaMock.purchaseInvoice.update.mockResolvedValue({
      id: 'purchase-1',
      paymentStatus: 'PART_PAID',
      payments: [{ amountPence: 1000 }, { amountPence: 2000 }],
    });

    const payments: PaymentInput[] = [{ method: 'CARD', amountPence: 2000 }];
    const result = await recordSupplierPayment('biz-1', 'purchase-1', payments, {
      ...ownerOpts,
      idempotencyKey: 'idem-card-1',
    });

    expect(prismaMock.purchaseInvoice.findFirst).toHaveBeenCalledWith({
      where: { id: 'purchase-1', businessId: 'biz-1' },
      include: {
        payments: true,
        supplier: { select: { id: true, name: true } },
      },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.purchasePayment.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.purchasePayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: 'biz-1',
        idempotencyKey: 'idem-card-1',
        payloadHash: expect.any(String),
      }),
    });
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    expect(result.replayed).toBe(false);
    expect(result.invoice).toMatchObject({ id: 'purchase-1' });
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
      { ...ownerOpts, idempotencyKey: 'idem-cash-1' },
    );

    expect(prismaMock.purchasePayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purchaseInvoiceId: 'purchase-1',
        method: 'CASH',
        amountPence: 50000,
        recordedByUserId: 'user-1',
        businessId: 'biz-1',
        idempotencyKey: 'idem-cash-1',
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
      { ...ownerOpts, idempotencyKey: 'idem-momo-1' },
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

  it('denies Cashier at the service boundary with no financial writes', async () => {
    await expect(
      recordSupplierPayment(
        'biz-1',
        'purchase-1',
        [{ method: 'CASH', amountPence: 1000 }],
        {
          recordedByUserId: 'cashier-1',
          actorRole: 'CASHIER',
          idempotencyKey: 'idem-cashier',
        },
      ),
    ).rejects.toMatchObject({
      code: SUPPLIER_PAYMENT_ERROR.FORBIDDEN,
    });

    expect(prismaMock.purchaseInvoice.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.purchasePayment.create).not.toHaveBeenCalled();
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
    expect(postJournalEntryMock).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('denies missing role at the service boundary', async () => {
    await expect(
      recordSupplierPayment(
        'biz-1',
        'purchase-1',
        [{ method: 'TRANSFER', amountPence: 1000 }],
        {
          recordedByUserId: 'user-1',
          actorRole: '',
          idempotencyKey: 'idem-no-role',
        },
      ),
    ).rejects.toBeInstanceOf(SupplierPaymentError);

    expect(prismaMock.purchasePayment.create).not.toHaveBeenCalled();
  });

  it('returns a safe not-found for cross-tenant invoice ids with no writes', async () => {
    prismaMock.purchasePayment.findUnique.mockResolvedValue(null);
    prismaMock.purchaseInvoice.findFirst.mockResolvedValue(null);

    await expect(
      recordSupplierPayment(
        'biz-1',
        'other-tenant-invoice',
        [{ method: 'CARD', amountPence: 1000 }],
        { ...ownerOpts, idempotencyKey: 'idem-xtenant' },
      ),
    ).rejects.toMatchObject({
      code: SUPPLIER_PAYMENT_ERROR.NOT_FOUND,
      message: 'Invoice not found',
    });

    expect(prismaMock.purchasePayment.create).not.toHaveBeenCalled();
    expect(postJournalEntryMock).not.toHaveBeenCalled();
  });

  it('replays an identical idempotent request without additional financial effects', async () => {
    const { buildSupplierPaymentPayloadHash } = await import('./payments');
    const hash = buildSupplierPaymentPayloadHash({
      businessId: 'biz-1',
      invoiceId: 'purchase-1',
      payments: [{ method: 'CARD', amountPence: 2000, reference: null }],
      paidAtIso: '',
      notes: '',
      recordedByUserId: 'user-1',
    });

    prismaMock.purchasePayment.findUnique.mockResolvedValue({
      id: 'pp-1',
      businessId: 'biz-1',
      purchaseInvoiceId: 'purchase-1',
      payloadHash: hash,
      amountPence: 2000,
      method: 'CARD',
    });
    prismaMock.purchaseInvoice.findFirst.mockResolvedValue({
      id: 'purchase-1',
      payments: [{ id: 'pp-1', amountPence: 2000 }],
    });

    const result = await recordSupplierPayment(
      'biz-1',
      'purchase-1',
      [{ method: 'CARD', amountPence: 2000 }],
      { ...ownerOpts, idempotencyKey: 'idem-replay' },
    );

    expect(result.replayed).toBe(true);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.purchasePayment.create).not.toHaveBeenCalled();
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
    expect(postJournalEntryMock).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects same idempotency key with a different amount', async () => {
    const { buildSupplierPaymentPayloadHash } = await import('./payments');
    const hash = buildSupplierPaymentPayloadHash({
      businessId: 'biz-1',
      invoiceId: 'purchase-1',
      payments: [{ method: 'CARD', amountPence: 2000, reference: null }],
      paidAtIso: '',
      notes: '',
      recordedByUserId: 'user-1',
    });

    prismaMock.purchasePayment.findUnique.mockResolvedValue({
      id: 'pp-1',
      businessId: 'biz-1',
      purchaseInvoiceId: 'purchase-1',
      payloadHash: hash,
      amountPence: 2000,
      method: 'CARD',
    });

    await expect(
      recordSupplierPayment(
        'biz-1',
        'purchase-1',
        [{ method: 'CARD', amountPence: 3000 }],
        { ...ownerOpts, idempotencyKey: 'idem-conflict' },
      ),
    ).rejects.toMatchObject({
      code: SUPPLIER_PAYMENT_ERROR.IDEMPOTENCY_CONFLICT,
    });

    expect(prismaMock.purchasePayment.create).not.toHaveBeenCalled();
  });

  it('rejects same idempotency key with a different supplier invoice', async () => {
    const { buildSupplierPaymentPayloadHash } = await import('./payments');
    const hash = buildSupplierPaymentPayloadHash({
      businessId: 'biz-1',
      invoiceId: 'purchase-1',
      payments: [{ method: 'CARD', amountPence: 2000, reference: null }],
      paidAtIso: '',
      notes: '',
      recordedByUserId: 'user-1',
    });

    prismaMock.purchasePayment.findUnique.mockResolvedValue({
      id: 'pp-1',
      businessId: 'biz-1',
      purchaseInvoiceId: 'purchase-1',
      payloadHash: hash,
      amountPence: 2000,
      method: 'CARD',
    });

    await expect(
      recordSupplierPayment(
        'biz-1',
        'purchase-2',
        [{ method: 'CARD', amountPence: 2000 }],
        { ...ownerOpts, idempotencyKey: 'idem-conflict-inv' },
      ),
    ).rejects.toMatchObject({
      code: SUPPLIER_PAYMENT_ERROR.IDEMPOTENCY_CONFLICT,
    });

    expect(prismaMock.purchasePayment.create).not.toHaveBeenCalled();
  });

  it('allows Manager to record a supplier payment', async () => {
    prismaMock.purchaseInvoice.findFirst.mockResolvedValue({
      id: 'purchase-1',
      businessId: 'biz-1',
      storeId: 'store-1',
      totalPence: 10000,
      payments: [],
      supplier: { id: 's1', name: 'S' },
    });
    prismaMock.purchaseInvoice.update.mockResolvedValue({
      id: 'purchase-1',
      paymentStatus: 'PART_PAID',
      payments: [{ amountPence: 1000 }],
    });

    const result = await recordSupplierPayment(
      'biz-1',
      'purchase-1',
      [{ method: 'TRANSFER', amountPence: 1000 }],
      {
        recordedByUserId: 'mgr-1',
        actorRole: 'MANAGER',
        actorName: 'Manager',
        idempotencyKey: 'idem-mgr',
      },
    );

    expect(result.replayed).toBe(false);
    expect(prismaMock.purchasePayment.create).toHaveBeenCalledTimes(1);
  });

  it('requires an idempotency key and does not reserve a success record on validation failure', async () => {
    await expect(
      recordSupplierPayment(
        'biz-1',
        'purchase-1',
        [{ method: 'CARD', amountPence: 1000 }],
        {
          recordedByUserId: 'user-1',
          actorRole: 'OWNER',
          idempotencyKey: '   ',
        },
      ),
    ).rejects.toMatchObject({
      code: SUPPLIER_PAYMENT_ERROR.IDEMPOTENCY_REQUIRED,
      message: expect.stringContaining('Refresh the page'),
    });

    expect(prismaMock.purchasePayment.create).not.toHaveBeenCalled();
    expect(prismaMock.purchasePayment.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a write-freeze rollout flag without creating records', async () => {
    const prev = process.env.TILLFLOW_SUPPLIER_PAYMENT_WRITES;
    process.env.TILLFLOW_SUPPLIER_PAYMENT_WRITES = '0';
    try {
      await expect(
        recordSupplierPayment(
          'biz-1',
          'purchase-1',
          [{ method: 'CARD', amountPence: 1000 }],
          { ...ownerOpts, idempotencyKey: 'idem-frozen' },
        ),
      ).rejects.toMatchObject({
        code: SUPPLIER_PAYMENT_ERROR.TEMPORARILY_UNAVAILABLE,
      });
      expect(prismaMock.purchasePayment.create).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.TILLFLOW_SUPPLIER_PAYMENT_WRITES;
      else process.env.TILLFLOW_SUPPLIER_PAYMENT_WRITES = prev;
    }
  });

  it('replays after unique-constraint race without duplicate posting', async () => {
    const { buildSupplierPaymentPayloadHash } = await import('./payments');
    const hash = buildSupplierPaymentPayloadHash({
      businessId: 'biz-1',
      invoiceId: 'purchase-1',
      payments: [{ method: 'CARD', amountPence: 2000, reference: null }],
      paidAtIso: '',
      notes: '',
      recordedByUserId: 'user-1',
    });

    prismaMock.purchasePayment.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'pp-winner',
        businessId: 'biz-1',
        purchaseInvoiceId: 'purchase-1',
        payloadHash: hash,
        amountPence: 2000,
        method: 'CARD',
      });

    prismaMock.purchaseInvoice.findFirst
      .mockResolvedValueOnce({
        id: 'purchase-1',
        totalPence: 10000,
        storeId: 'store-1',
      })
      .mockResolvedValueOnce({
        id: 'purchase-1',
        payments: [{ id: 'pp-winner', amountPence: 2000 }],
      });

    const uniqueError = Object.assign(new Error('Unique constraint'), {
      code: 'P2002',
      meta: { target: ['businessId', 'idempotencyKey'] },
    });
    prismaMock.$transaction.mockRejectedValueOnce(uniqueError);

    const result = await recordSupplierPayment(
      'biz-1',
      'purchase-1',
      [{ method: 'CARD', amountPence: 2000 }],
      { ...ownerOpts, idempotencyKey: 'idem-race' },
    );

    expect(result.replayed).toBe(true);
    expect(prismaMock.purchasePayment.create).not.toHaveBeenCalled();
    expect(postJournalEntryMock).not.toHaveBeenCalled();
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
        receiptOrigin: 'LATER_CREDIT_COLLECTION',
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

describe('supplier payment GH₵1,400 expected-cash reconciliation (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
    prismaMock.purchasePayment.findUnique.mockResolvedValue(null);
    prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    prismaMock.purchasePayment.create.mockImplementation(async ({ data }: any) => ({
      id: 'pp-supplier-300',
      ...data,
    }));
  });

  it('posts till-funded supplier cash-out once and keeps expected cash at GH₵1,400 on replay', async () => {
    // Scenario (minor units): float 50000 + sale 100000 + receipt 20000 - supplier 30000 = 140000
    const openingCash = 50000;
    const cashInflows = 100000 + 20000;
    const supplierCashOut = 30000;
    const expectedCash = openingCash + cashInflows - supplierCashOut;
    expect(expectedCash).toBe(140000);

    let shiftExpected = openingCash + cashInflows;
    recordCashDrawerEntryTxMock.mockImplementation(async (_tx: unknown, input: { amountPence: number }) => {
      shiftExpected += input.amountPence;
      return { entry: { id: 'cde-1' }, afterExpectedCashPence: shiftExpected };
    });

    prismaMock.purchaseInvoice.findFirst.mockResolvedValue({
      id: 'purchase-600',
      businessId: 'biz-1',
      storeId: 'store-1',
      totalPence: 60000,
      payments: [],
      supplier: { id: 'sup-1', name: 'Supplier' },
    });
    prismaMock.shift.findFirst.mockResolvedValue({ id: 'shift-1', tillId: 'till-1' });
    prismaMock.purchaseInvoice.update.mockResolvedValue({
      id: 'purchase-600',
      paymentStatus: 'PART_PAID',
      payments: [{ id: 'pp-supplier-300', amountPence: 30000 }],
    });

    const first = await recordSupplierPayment(
      'biz-1',
      'purchase-600',
      [{ method: 'CASH', amountPence: 30000 }],
      {
        recordedByUserId: 'user-1',
        actorRole: 'OWNER',
        actorName: 'Owner',
        idempotencyKey: 'idem-1400',
      },
    );

    expect(first.replayed).toBe(false);
    expect(shiftExpected).toBe(140000);
    expect(recordCashDrawerEntryTxMock).toHaveBeenCalledTimes(1);
    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.purchasePayment.create).toHaveBeenCalledTimes(1);

    const { buildSupplierPaymentPayloadHash } = await import('./payments');
    const hash = buildSupplierPaymentPayloadHash({
      businessId: 'biz-1',
      invoiceId: 'purchase-600',
      payments: [{ method: 'CASH', amountPence: 30000, reference: null }],
      paidAtIso: '',
      notes: '',
      recordedByUserId: 'user-1',
    });
    prismaMock.purchasePayment.findUnique.mockResolvedValue({
      id: 'pp-supplier-300',
      businessId: 'biz-1',
      purchaseInvoiceId: 'purchase-600',
      payloadHash: hash,
      amountPence: 30000,
      method: 'CASH',
    });
    prismaMock.purchaseInvoice.findFirst.mockResolvedValue({
      id: 'purchase-600',
      payments: [{ id: 'pp-supplier-300', amountPence: 30000 }],
      totalPence: 60000,
    });

    const replay = await recordSupplierPayment(
      'biz-1',
      'purchase-600',
      [{ method: 'CASH', amountPence: 30000 }],
      {
        recordedByUserId: 'user-1',
        actorRole: 'OWNER',
        actorName: 'Owner',
        idempotencyKey: 'idem-1400',
      },
    );

    expect(replay.replayed).toBe(true);
    expect(shiftExpected).toBe(140000);
    expect(recordCashDrawerEntryTxMock).toHaveBeenCalledTimes(1);
    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.purchasePayment.create).toHaveBeenCalledTimes(1);
    const outstanding =
      60000 -
      (replay.invoice?.payments.reduce((s: number, p: { amountPence: number }) => s + p.amountPence, 0) ?? 0);
    expect(outstanding).toBe(30000);
  });
});
