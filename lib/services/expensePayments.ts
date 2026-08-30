import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { derivePaymentStatus, creditCashBankLines, splitPayments, type JournalLine } from './shared';
import { getOpenCashShiftForPayment, recordCashDrawerEntryTx } from './cash-drawer';
import { CASH_EXPENSE_SHIFT_REQUIRED_MSG } from './expenses';
import {
  assertMoneyMovementTenantChain,
  buildExpensePaymentPayloadHash,
  findMoneyIdempotency,
  insertMoneyIdempotency,
  isPrismaUniqueConstraintOn,
  lockExpenseForUpdate,
  MoneyIdempotencyError,
  MONEY_IDEMPOTENCY_ERROR,
  normalizeMoneyIdempotencyKey,
  parseIdempotencyResult,
  replayOrConflict,
  sumAmountPence,
} from './money-idempotency';

export type ExpensePaymentInput = {
  businessId: string;
  storeId: string;
  userId: string;
  expenseId: string;
  method: 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';
  amountPence: number;
  reference?: string | null;
  idempotencyKey: string;
};

export async function recordExpensePayment(input: ExpensePaymentInput) {
  if (input.amountPence <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  const idempotencyKey = normalizeMoneyIdempotencyKey(input.idempotencyKey);
  const payloadHash = buildExpensePaymentPayloadHash({
    businessId: input.businessId,
    expenseId: input.expenseId,
    method: input.method,
    amountPence: input.amountPence,
    reference: input.reference ?? '',
    userId: input.userId,
  });

  const existing = await findMoneyIdempotency(prisma as any, input.businessId, idempotencyKey);
  if (existing) {
    replayOrConflict(existing, {
      payloadHash,
      commandKind: 'EXPENSE_PAYMENT',
      entityId: input.expenseId,
      entityIdKey: 'expenseId',
    });
    const parsed = parseIdempotencyResult<{ paymentId: string }>(existing.resultJson);
    const replayed = await prisma.expensePayment.findFirst({
      where: { id: parsed.paymentId, businessId: input.businessId, expenseId: input.expenseId },
    });
    if (!replayed) throw new Error('Expense payment not found');
    return replayed;
  }

  const expense = await prisma.expense.findFirst({
    where: { id: input.expenseId, businessId: input.businessId },
    select: { id: true, storeId: true, amountPence: true },
  });
  if (!expense) throw new Error('Expense not found');
  if (expense.storeId !== input.storeId) {
    throw new Error('Expense does not belong to the selected store');
  }

  const split = splitPayments([{ method: input.method, amountPence: input.amountPence }]);

  try {
    return await prisma.$transaction(async (tx) => {
      const existingInTx = await findMoneyIdempotency(tx as any, input.businessId, idempotencyKey);
      if (existingInTx) {
        replayOrConflict(existingInTx, {
          payloadHash,
          commandKind: 'EXPENSE_PAYMENT',
          entityId: input.expenseId,
          entityIdKey: 'expenseId',
        });
        const parsed = parseIdempotencyResult<{ paymentId: string }>(existingInTx.resultJson);
        const replayed = await tx.expensePayment.findFirst({
          where: { id: parsed.paymentId, businessId: input.businessId, expenseId: input.expenseId },
        });
        if (!replayed) throw new Error('Expense payment not found');
        return replayed;
      }

      await lockExpenseForUpdate(tx as any, input.businessId, input.expenseId);

      const locked = await tx.expense.findFirst({
        where: { id: input.expenseId, businessId: input.businessId },
        include: { payments: true },
      });
      if (!locked) throw new Error('Expense not found');
      if (locked.storeId !== input.storeId) {
        throw new Error('Expense does not belong to the selected store');
      }

      const paidSoFar = sumAmountPence(locked.payments);
      if (input.amountPence > locked.amountPence - paidSoFar) {
        throw new Error('Payment exceeds outstanding balance');
      }

      const openShift =
        input.method === 'CASH'
          ? await getOpenCashShiftForPayment(tx, {
              businessId: input.businessId,
              storeId: input.storeId,
              userId: input.userId,
            })
          : null;

      if (input.method === 'CASH' && !openShift) {
        throw new Error(CASH_EXPENSE_SHIFT_REQUIRED_MSG);
      }

      await assertMoneyMovementTenantChain(tx as any, {
        businessId: input.businessId,
        storeId: input.storeId,
        userId: input.userId,
        tillId: openShift?.tillId,
        shiftId: openShift?.id,
      });

      const createdPayment = await tx.expensePayment.create({
        data: {
          businessId: input.businessId,
          storeId: input.storeId,
          userId: input.userId,
          expenseId: input.expenseId,
          method: input.method,
          amountPence: input.amountPence,
          reference: input.reference ?? null,
        },
      });

      const persisted = await tx.expensePayment.findMany({
        where: { expenseId: locked.id },
        select: { amountPence: true },
      });
      const newPaid = sumAmountPence(persisted);
      if (newPaid > locked.amountPence) {
        throw new Error('Payment exceeds outstanding balance');
      }
      const status = derivePaymentStatus(locked.amountPence, newPaid);

      await tx.expense.update({
        where: { id: locked.id },
        data: { paymentStatus: status, method: input.method },
      });

      if (openShift) {
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

      await postJournalEntry({
        businessId: input.businessId,
        description: `Expense payment ${createdPayment.id}`,
        referenceType: 'EXPENSE_PAYMENT',
        referenceId: createdPayment.id,
        lines: [
          { accountCode: ACCOUNT_CODES.ap, debitPence: input.amountPence },
          ...creditCashBankLines(split),
        ].filter(Boolean) as JournalLine[],
        prismaClient: tx as any,
      });

      await insertMoneyIdempotency(tx as any, {
        businessId: input.businessId,
        key: idempotencyKey,
        payloadHash,
        commandKind: 'EXPENSE_PAYMENT',
        resultJson: JSON.stringify({ expenseId: locked.id, paymentId: createdPayment.id }),
      });

      return createdPayment;
    });
  } catch (error) {
    if (isPrismaUniqueConstraintOn(error, ['businessId', 'key'])) {
      const winner = await findMoneyIdempotency(prisma as any, input.businessId, idempotencyKey);
      if (winner) {
        replayOrConflict(winner, {
          payloadHash,
          commandKind: 'EXPENSE_PAYMENT',
          entityId: input.expenseId,
          entityIdKey: 'expenseId',
        });
        const parsed = parseIdempotencyResult<{ paymentId: string }>(winner.resultJson);
        const replayed = await prisma.expensePayment.findFirst({
          where: { id: parsed.paymentId, businessId: input.businessId, expenseId: input.expenseId },
        });
        if (replayed) return replayed;
      }
      throw new MoneyIdempotencyError(
        MONEY_IDEMPOTENCY_ERROR.IDEMPOTENCY_CONFLICT,
        'This payment request conflicts with a previous submission.',
      );
    }
    throw error;
  }
}
