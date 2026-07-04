import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { derivePaymentStatus, creditCashBankLines, splitPayments, type JournalLine } from './shared';
import { getOpenCashShiftForPayment, recordCashDrawerEntryTx } from './cash-drawer';
import { CASH_EXPENSE_SHIFT_REQUIRED_MSG } from './expenses';

export type ExpensePaymentInput = {
  businessId: string;
  storeId: string;
  userId: string;
  expenseId: string;
  method: 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';
  amountPence: number;
  reference?: string | null;
};

export async function recordExpensePayment(input: ExpensePaymentInput) {
  if (input.amountPence <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  const expense = await prisma.expense.findFirst({
    where: { id: input.expenseId, businessId: input.businessId },
    include: { payments: true }
  });
  if (!expense) throw new Error('Expense not found');
  if (expense.storeId !== input.storeId) {
    throw new Error('Expense does not belong to the selected store');
  }

  const paidSoFar = expense.payments.reduce((sum, p) => sum + p.amountPence, 0);
  const remaining = expense.amountPence - paidSoFar;
  if (input.amountPence > remaining) {
    throw new Error('Payment exceeds outstanding balance');
  }

  const newPaid = paidSoFar + input.amountPence;
  const status = derivePaymentStatus(expense.amountPence, newPaid);
  const split = splitPayments([{ method: input.method, amountPence: input.amountPence }]);

  const payment = await prisma.$transaction(async (tx) => {
    const createdPayment = await tx.expensePayment.create({
      data: {
        businessId: input.businessId,
        storeId: input.storeId,
        userId: input.userId,
        expenseId: input.expenseId,
        method: input.method,
        amountPence: input.amountPence,
        reference: input.reference ?? null
      }
    });

    await tx.expense.update({
      where: { id: expense.id },
      data: { paymentStatus: status, method: input.method }
    });

    if (input.method === 'CASH') {
      const openShift = await getOpenCashShiftForPayment(tx, {
        businessId: input.businessId,
        storeId: input.storeId,
        userId: input.userId,
      });

      if (!openShift) {
        throw new Error(CASH_EXPENSE_SHIFT_REQUIRED_MSG);
      }

      const existingDrawerEntry = await tx.cashDrawerEntry.findFirst({
        where: {
          referenceType: 'EXPENSE_PAYMENT',
          referenceId: createdPayment.id,
          entryType: 'PAID_OUT_EXPENSE',
        },
      });

      if (!existingDrawerEntry) {
        await recordCashDrawerEntryTx(tx, {
          businessId: input.businessId,
          storeId: input.storeId,
          tillId: openShift.tillId,
          shiftId: openShift.id,
          createdByUserId: input.userId,
          cashierUserId: input.userId,
          entryType: 'PAID_OUT_EXPENSE',
          amountPence: -input.amountPence,
          reasonCode: 'EXPENSE_PAYMENT',
          reason: 'Cash paid out for expense',
          referenceType: 'EXPENSE_PAYMENT',
          referenceId: createdPayment.id,
        });
      }
    }

    await postJournalEntry({
      businessId: input.businessId,
      description: `Expense payment ${createdPayment.id}`,
      referenceType: 'EXPENSE_PAYMENT',
      referenceId: createdPayment.id,
      lines: [
        { accountCode: ACCOUNT_CODES.ap, debitPence: input.amountPence },
        ...creditCashBankLines(split)
      ].filter(Boolean) as JournalLine[],
      prismaClient: tx as any
    });

    return createdPayment;
  });

  return payment;
}
