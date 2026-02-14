import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { derivePaymentStatus, creditCashBankLines, splitPayments, type JournalLine } from './shared';

export type ExpensePaymentInput = {
  businessId: string;
  storeId: string;
  userId: string;
  expenseId: string;
  method: 'CASH' | 'CARD' | 'TRANSFER';
  amountPence: number;
  reference?: string | null;
};

export async function recordExpensePayment(input: ExpensePaymentInput) {
  if (input.amountPence <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  const expense = await prisma.expense.findUnique({
    where: { id: input.expenseId },
    include: { payments: true }
  });
  if (!expense) throw new Error('Expense not found');

  const paidSoFar = expense.payments.reduce((sum, p) => sum + p.amountPence, 0);
  const remaining = expense.amountPence - paidSoFar;
  if (input.amountPence > remaining) {
    throw new Error('Payment exceeds outstanding balance');
  }

  const payment = await prisma.expensePayment.create({
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

  const newPaid = paidSoFar + input.amountPence;
  const status = derivePaymentStatus(expense.amountPence, newPaid);

  await prisma.expense.update({
    where: { id: expense.id },
    data: { paymentStatus: status, method: input.method }
  });

  const split = splitPayments([{ method: input.method, amountPence: input.amountPence }]);

  await postJournalEntry({
    businessId: input.businessId,
    description: `Expense payment ${payment.id}`,
    referenceType: 'EXPENSE_PAYMENT',
    referenceId: payment.id,
    lines: [
      { accountCode: ACCOUNT_CODES.ap, debitPence: input.amountPence },
      ...creditCashBankLines(split)
    ].filter(Boolean) as JournalLine[]
  });

  return payment;
}
