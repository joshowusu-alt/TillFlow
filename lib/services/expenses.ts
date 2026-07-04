import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { creditCashBankLines, splitPayments, type JournalLine } from './shared';
import { getOpenCashShiftForPayment, recordCashDrawerEntryTx } from './cash-drawer';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';

export const CASH_EXPENSE_SHIFT_REQUIRED_MSG =
  'Open a shift before recording a cash expense from the till.';

export type ExpenseInput = {
  businessId: string;
  storeId: string;
  userId: string;
  accountId: string;
  amountPence: number;
  paymentStatus: 'PAID' | 'PART_PAID' | 'UNPAID';
  method?: 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY' | null;
  amountPaidPence?: number;
  dueDate?: Date | null;
  vendorName?: string | null;
  reference?: string | null;
  attachmentPath?: string | null;
  notes?: string | null;
};

export async function createExpense(input: ExpenseInput) {
  return measureServerOperation(
    'action.expense.create',
    () => createExpenseImpl(input),
    {
      businessId: input.businessId,
      storeId: input.storeId,
      action: 'createExpenseAction',
      cacheState: 'write-through',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.action, operationType: 'action' },
  );
}

async function createExpenseImpl(input: ExpenseInput) {
  if (input.amountPence <= 0) throw new Error('Amount must be greater than 0');

  const account = await prisma.account.findFirst({
    where: { id: input.accountId, businessId: input.businessId }
  });
  if (!account) throw new Error('Expense account not found');

  const store = await prisma.store.findFirst({
    where: { id: input.storeId, businessId: input.businessId },
    select: { id: true },
  });
  if (!store) throw new Error('Store not found for your business');

  const amountPaid = Math.max(input.amountPaidPence ?? 0, 0);
  if (amountPaid > input.amountPence) throw new Error('Paid amount cannot exceed expense total');

  const paymentStatus =
    input.paymentStatus === 'UNPAID'
      ? 'UNPAID'
      : amountPaid === 0
        ? 'UNPAID'
        : amountPaid >= input.amountPence
          ? 'PAID'
          : 'PART_PAID';

  return prisma.$transaction(async (tx) => {
    const method = input.method ?? 'CASH';
    const split = splitPayments(
      amountPaid > 0 ? [{ method, amountPence: amountPaid }] : []
    );

    const openShift =
      split.cashPence > 0
        ? await getOpenCashShiftForPayment(tx, {
            businessId: input.businessId,
            storeId: input.storeId,
            userId: input.userId,
          })
        : null;

    if (split.cashPence > 0 && !openShift) {
      throw new Error(CASH_EXPENSE_SHIFT_REQUIRED_MSG);
    }

    const expense = await tx.expense.create({
      data: {
        businessId: input.businessId,
        storeId: input.storeId,
        userId: input.userId,
        accountId: input.accountId,
        amountPence: input.amountPence,
        paymentStatus,
        method: amountPaid > 0 ? method : null,
        dueDate: input.dueDate ?? null,
        vendorName: input.vendorName ?? null,
        reference: input.reference ?? null,
        attachmentPath: input.attachmentPath ?? null,
        notes: input.notes ?? null,
        payments:
          amountPaid > 0
            ? {
                create: [
                  {
                    businessId: input.businessId,
                    storeId: input.storeId,
                    userId: input.userId,
                    method: method as string,
                    amountPence: amountPaid,
                    reference: input.reference ?? null
                  }
                ]
              }
            : undefined
      },
      include: { account: true, payments: true }
    });

    if (split.cashPence > 0 && openShift) {
      const cashPayment = expense.payments.find((p) => p.method === 'CASH');
      if (cashPayment) {
        await recordCashDrawerEntryTx(tx, {
          businessId: input.businessId,
          storeId: input.storeId,
          tillId: openShift.tillId,
          shiftId: openShift.id,
          createdByUserId: input.userId,
          cashierUserId: input.userId,
          entryType: 'PAID_OUT_EXPENSE',
          amountPence: -cashPayment.amountPence,
          reasonCode: 'EXPENSE_PAYMENT',
          reason: 'Cash paid out for expense',
          referenceType: 'EXPENSE_PAYMENT',
          referenceId: cashPayment.id,
        });
      }
    }

    const apCredit = Math.max(input.amountPence - amountPaid, 0);

    await postJournalEntry({
      businessId: input.businessId,
      description: `Expense ${expense.id}`,
      referenceType: 'EXPENSE',
      referenceId: expense.id,
      lines: [
        { accountCode: expense.account.code, debitPence: input.amountPence },
        ...creditCashBankLines(split),
        apCredit > 0 ? { accountCode: ACCOUNT_CODES.ap, creditPence: apCredit } : null
      ].filter(Boolean) as JournalLine[],
      prismaClient: tx as any,
    });

    return expense;
  });
}
