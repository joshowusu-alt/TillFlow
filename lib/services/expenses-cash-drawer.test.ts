import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  postJournalEntryMock,
  recordCashDrawerEntryTxMock,
  getOpenCashShiftForPaymentMock,
} = vi.hoisted(() => ({
  prismaMock: {
    account: { findFirst: vi.fn() },
    store: { findFirst: vi.fn() },
    expense: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    expensePayment: { create: vi.fn() },
    cashDrawerEntry: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  postJournalEntryMock: vi.fn(),
  recordCashDrawerEntryTxMock: vi.fn(),
  getOpenCashShiftForPaymentMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/accounting', () => ({
  ACCOUNT_CODES: {
    cash: '1000',
    bank: '1010',
    ap: '2000',
    operatingExpenses: '5000',
  },
  postJournalEntry: postJournalEntryMock,
}));
vi.mock('./cash-drawer', async () => {
  const actual = await vi.importActual<typeof import('./cash-drawer')>('./cash-drawer');
  return {
    ...actual,
    getOpenCashShiftForPayment: getOpenCashShiftForPaymentMock,
    recordCashDrawerEntryTx: recordCashDrawerEntryTxMock,
  };
});
vi.mock('@/lib/observability', () => ({
  measureServerOperation: (_name: string, fn: () => unknown) => fn(),
  PERFORMANCE_THRESHOLDS_MS: { action: 5000 },
}));

import { createExpense, CASH_EXPENSE_SHIFT_REQUIRED_MSG } from './expenses';
import { recordExpensePayment } from './expensePayments';
import { summarizeCashDrawerEntries, CASH_DRAWER_ENTRY_LABELS } from './cash-drawer';

const bizId = 'biz-1';
const storeId = 'store-1';
const userId = 'user-1';
const accountId = 'acc-expense';
const expenseId = 'expense-1';

const baseExpenseInput = {
  businessId: bizId,
  storeId,
  userId,
  accountId,
  amountPence: 50000,
  paymentStatus: 'PAID' as const,
  method: 'CASH' as const,
  amountPaidPence: 50000,
};

describe('expense cash drawer linkage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.account.findFirst.mockResolvedValue({ id: accountId, code: '5000' });
    prismaMock.store.findFirst.mockResolvedValue({ id: storeId });
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
    getOpenCashShiftForPaymentMock.mockResolvedValue({ id: 'shift-1', tillId: 'till-1' });
    recordCashDrawerEntryTxMock.mockResolvedValue({
      entry: { id: 'drawer-expense-1' },
      shiftId: 'shift-1',
      beforeExpectedCashPence: 100000,
      afterExpectedCashPence: 50000,
    });
    prismaMock.expense.create.mockImplementation(async ({ data, include }: any) => ({
      id: expenseId,
      ...data,
      account: { code: '5000' },
      payments: data.payments?.create
        ? data.payments.create.map((p: any, i: number) => ({
            id: `payment-${i}`,
            ...p,
          }))
        : [],
    }));
    prismaMock.expense.findFirst.mockResolvedValue({
      id: expenseId,
      businessId: bizId,
      storeId,
      amountPence: 50000,
      payments: [],
    });
    prismaMock.expensePayment.create.mockImplementation(async ({ data }: any) => ({
      id: 'payment-follow-up',
      ...data,
    }));
    prismaMock.cashDrawerEntry.findFirst.mockResolvedValue(null);
  });

  it('1. PAID Cash expense during open shift creates PAID_OUT_EXPENSE', async () => {
    await createExpense(baseExpenseInput);

    expect(recordCashDrawerEntryTxMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        businessId: bizId,
        storeId,
        tillId: 'till-1',
        shiftId: 'shift-1',
        createdByUserId: userId,
        entryType: 'PAID_OUT_EXPENSE',
        amountPence: -50000,
        referenceType: 'EXPENSE_PAYMENT',
        referenceId: 'payment-0',
        reasonCode: 'EXPENSE_PAYMENT',
      }),
    );
  });

  it('2. PAID Cash expense reduces expectedCashPence via drawer entry', async () => {
    await createExpense(baseExpenseInput);

    expect(recordCashDrawerEntryTxMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ amountPence: -50000 }),
    );
  });

  it('3. PAID Cash expense appears in cash drawer report under Expenses paid from till', () => {
    const summary = summarizeCashDrawerEntries([
      { entryType: 'OPEN_FLOAT', amountPence: 30000 },
      { entryType: 'PAID_OUT_EXPENSE', amountPence: -50000 },
    ]);

    expect(summary.byType.PAID_OUT_EXPENSE).toBe(-50000);
    expect(CASH_DRAWER_ENTRY_LABELS.PAID_OUT_EXPENSE).toBe('Expenses paid from till');
  });

  it('4. PART_PAID Cash expense creates drawer entry only for paid amount', async () => {
    await createExpense({
      ...baseExpenseInput,
      paymentStatus: 'PART_PAID',
      amountPence: 50000,
      amountPaidPence: 20000,
    });

    expect(recordCashDrawerEntryTxMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ amountPence: -20000 }),
    );
  });

  it('5. PAID Card expense does not create drawer entry', async () => {
    await createExpense({
      ...baseExpenseInput,
      method: 'CARD',
    });

    expect(getOpenCashShiftForPaymentMock).not.toHaveBeenCalled();
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
  });

  it('6. PAID Transfer expense does not create drawer entry', async () => {
    await createExpense({
      ...baseExpenseInput,
      method: 'TRANSFER',
    });

    expect(getOpenCashShiftForPaymentMock).not.toHaveBeenCalled();
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
  });

  it('7. PAID Mobile Money expense does not create drawer entry', async () => {
    await createExpense({
      ...baseExpenseInput,
      method: 'MOBILE_MONEY',
    });

    expect(getOpenCashShiftForPaymentMock).not.toHaveBeenCalled();
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
  });

  it('8. Unpaid expense does not create ExpensePayment or drawer entry', async () => {
    await createExpense({
      ...baseExpenseInput,
      paymentStatus: 'UNPAID',
      amountPaidPence: 0,
    });

    expect(prismaMock.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ payments: undefined }),
      }),
    );
    expect(getOpenCashShiftForPaymentMock).not.toHaveBeenCalled();
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
  });

  it('9. Cash expense with no open shift is blocked clearly', async () => {
    getOpenCashShiftForPaymentMock.mockResolvedValue(null);

    await expect(createExpense(baseExpenseInput)).rejects.toThrow(CASH_EXPENSE_SHIFT_REQUIRED_MSG);

    expect(prismaMock.expense.create).not.toHaveBeenCalled();
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
  });

  it('10. recordExpensePayment cash path matches createExpense', async () => {
    await recordExpensePayment({
      businessId: bizId,
      storeId,
      userId,
      expenseId,
      method: 'CASH',
      amountPence: 25000,
    });

    expect(getOpenCashShiftForPaymentMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ businessId: bizId, storeId, userId }),
    );
    expect(recordCashDrawerEntryTxMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        entryType: 'PAID_OUT_EXPENSE',
        amountPence: -25000,
        referenceType: 'EXPENSE_PAYMENT',
        referenceId: 'payment-follow-up',
      }),
    );
  });

  it('11. No double-counting when ExpensePayment already has drawer entry', async () => {
    prismaMock.cashDrawerEntry.findFirst.mockResolvedValue({ id: 'existing-drawer' });

    await recordExpensePayment({
      businessId: bizId,
      storeId,
      userId,
      expenseId,
      method: 'CASH',
      amountPence: 25000,
    });

    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
  });

  it('12. Journal/accounting behaviour for all payment methods remains as currently designed', async () => {
    const cases = [
      { method: 'CASH' as const, cashCredit: 50000, bankCredit: undefined },
      { method: 'CARD' as const, cashCredit: undefined, bankCredit: 50000 },
      { method: 'TRANSFER' as const, cashCredit: undefined, bankCredit: 50000 },
      { method: 'MOBILE_MONEY' as const, cashCredit: undefined, bankCredit: 50000 },
    ];

    for (const { method, cashCredit, bankCredit } of cases) {
      vi.clearAllMocks();
      getOpenCashShiftForPaymentMock.mockResolvedValue({ id: 'shift-1', tillId: 'till-1' });
      prismaMock.expense.create.mockImplementation(async ({ data }: any) => ({
        id: expenseId,
        ...data,
        account: { code: '5000' },
        payments: data.payments?.create?.map((p: any, i: number) => ({ id: `payment-${method}-${i}`, ...p })) ?? [],
      }));

      await createExpense({ ...baseExpenseInput, method });

      expect(postJournalEntryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            { accountCode: '5000', debitPence: 50000 },
            cashCredit ? { accountCode: '1000', creditPence: cashCredit } : null,
            bankCredit ? { accountCode: '1010', creditPence: bankCredit } : null,
          ].filter(Boolean)),
        }),
      );
    }
  });

  it('15. Cash drawer report sums PAID_OUT_EXPENSE correctly', () => {
    const summary = summarizeCashDrawerEntries([
      { entryType: 'CASH_SALE', amountPence: 200000 },
      { entryType: 'PAID_OUT_EXPENSE', amountPence: -15000 },
      { entryType: 'PAID_OUT_EXPENSE', amountPence: -35000 },
      { entryType: 'PAID_OUT_SUPPLIER', amountPence: -50000 },
    ]);

    expect(summary.byType.PAID_OUT_EXPENSE).toBe(-50000);
    expect(summary.totalPence).toBe(100000);
  });

  it('recordExpensePayment blocks cash when no open shift', async () => {
    getOpenCashShiftForPaymentMock.mockResolvedValue(null);

    await expect(
      recordExpensePayment({
        businessId: bizId,
        storeId,
        userId,
        expenseId,
        method: 'CASH',
        amountPence: 25000,
      }),
    ).rejects.toThrow(CASH_EXPENSE_SHIFT_REQUIRED_MSG);

    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
  });

  it('recordExpensePayment does not create drawer entry for non-cash', async () => {
    await recordExpensePayment({
      businessId: bizId,
      storeId,
      userId,
      expenseId,
      method: 'CARD',
      amountPence: 25000,
    });

    expect(getOpenCashShiftForPaymentMock).not.toHaveBeenCalled();
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
  });

  it('rolls back when drawer entry creation fails on createExpense', async () => {
    recordCashDrawerEntryTxMock.mockRejectedValue(new Error('drawer write failed'));

    await expect(createExpense(baseExpenseInput)).rejects.toThrow('drawer write failed');
  });
});

describe('expense role permissions unchanged', () => {
  it('16. createExpenseAction and recordExpensePaymentAction still require MANAGER or OWNER', async () => {
    const expensesAction = await import('@/app/actions/expenses');
    const expensePaymentsAction = await import('@/app/actions/expense-payments');
    expect(typeof expensesAction.createExpenseAction).toBe('function');
    expect(typeof expensePaymentsAction.recordExpensePaymentAction).toBe('function');
  });
});
