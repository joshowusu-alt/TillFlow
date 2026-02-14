import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { creditCashBankLines, splitPayments, type JournalLine } from './shared';

export type ExpenseInput = {
  businessId: string;
  storeId: string;
  userId: string;
  accountId: string;
  amountPence: number;
  paymentStatus: 'PAID' | 'PART_PAID' | 'UNPAID';
  method?: 'CASH' | 'CARD' | 'TRANSFER' | null;
  amountPaidPence?: number;
  dueDate?: Date | null;
  vendorName?: string | null;
  reference?: string | null;
  attachmentPath?: string | null;
  notes?: string | null;
};

export async function createExpense(input: ExpenseInput) {
  if (input.amountPence <= 0) throw new Error('Amount must be greater than 0');

  const account = await prisma.account.findUnique({ where: { id: input.accountId } });
  if (!account) throw new Error('Expense account not found');

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

  const expense = await prisma.expense.create({
    data: {
      businessId: input.businessId,
      storeId: input.storeId,
      userId: input.userId,
      accountId: input.accountId,
      amountPence: input.amountPence,
      paymentStatus,
      method: amountPaid > 0 ? input.method ?? 'CASH' : null,
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
                  method: (input.method ?? 'CASH') as string,
                  amountPence: amountPaid,
                  reference: input.reference ?? null
                }
              ]
            }
          : undefined
    },
    include: { account: true }
  });

  const method = input.method ?? 'CASH';
  const split = splitPayments(
    amountPaid > 0 ? [{ method, amountPence: amountPaid }] : []
  );
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
    ].filter(Boolean) as JournalLine[]
  });

  return expense;
}
