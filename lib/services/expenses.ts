import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { creditCashBankLines, derivePaymentStatus, splitPayments, type JournalLine } from './shared';
import {
  EXPLICIT_CASH_TILL_REQUIRED_MSG,
  getOpenCashShiftForPayment,
  recordCashDrawerEntryTx,
} from './cash-drawer';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';
import {
  assertMoneyMovementTenantChain,
  buildExpenseCreatePayloadHash,
  findMoneyIdempotency,
  insertMoneyIdempotency,
  isPrismaUniqueConstraintOn,
  MoneyIdempotencyError,
  MONEY_IDEMPOTENCY_ERROR,
  normalizeMoneyIdempotencyKey,
  parseIdempotencyResult,
  replayOrConflict,
  sumAmountPence,
} from './money-idempotency';

export const CASH_EXPENSE_SHIFT_REQUIRED_MSG = EXPLICIT_CASH_TILL_REQUIRED_MSG;

export type ExpenseInput = {
  businessId: string;
  storeId: string;
  userId: string;
  accountId: string;
  amountPence: number;
  paymentStatus: 'PAID' | 'PART_PAID' | 'UNPAID';
  method?: 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY' | null;
  amountPaidPence?: number;
  /** Required when the first payment is CASH. */
  tillId?: string | null;
  shiftId?: string | null;
  dueDate?: Date | null;
  vendorName?: string | null;
  reference?: string | null;
  attachmentPath?: string | null;
  notes?: string | null;
  /** Required for durable replay when the first payment is externally repeatable. */
  idempotencyKey?: string;
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

async function loadExpenseWithPayments(businessId: string, expenseId: string, tx: typeof prisma | any = prisma) {
  return tx.expense.findFirst({
    where: { id: expenseId, businessId },
    include: { account: true, payments: true },
  });
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

  const method = input.method ?? 'CASH';
  const hasFirstPayment = amountPaid > 0;
  const idempotencyKey = hasFirstPayment && input.idempotencyKey
    ? normalizeMoneyIdempotencyKey(input.idempotencyKey)
    : null;
  const payloadHash = idempotencyKey
    ? buildExpenseCreatePayloadHash({
        businessId: input.businessId,
        storeId: input.storeId,
        accountId: input.accountId,
        amountPence: input.amountPence,
        amountPaidPence: amountPaid,
        method,
        vendorName: input.vendorName ?? '',
        reference: input.reference ?? '',
        userId: input.userId,
      })
    : null;

  if (idempotencyKey && payloadHash) {
    const existing = await findMoneyIdempotency(prisma as any, input.businessId, idempotencyKey);
    if (existing) {
      replayOrConflict(existing, { payloadHash, commandKind: 'EXPENSE_CREATE' });
      const parsed = parseIdempotencyResult<{ expenseId: string }>(existing.resultJson);
      const replayed = await loadExpenseWithPayments(input.businessId, parsed.expenseId);
      if (!replayed) throw new Error('Expense not found');
      return replayed;
    }
  }

  const runCreate = async (tx: typeof prisma | any) => {
    const split = splitPayments(
      amountPaid > 0 ? [{ method, amountPence: amountPaid }] : []
    );

    const openShift =
      split.cashPence > 0
        ? await getOpenCashShiftForPayment(tx, {
            businessId: input.businessId,
            storeId: input.storeId,
            tillId: input.tillId,
            shiftId: input.shiftId,
          })
        : null;

    if (split.cashPence > 0 && !openShift) {
      throw new Error(CASH_EXPENSE_SHIFT_REQUIRED_MSG);
    }

    await assertMoneyMovementTenantChain(tx, {
      businessId: input.businessId,
      storeId: input.storeId,
      userId: input.userId,
      tillId: openShift?.tillId,
      shiftId: openShift?.id,
    });

    const expense = await tx.expense.create({
      data: {
        businessId: input.businessId,
        storeId: input.storeId,
        userId: input.userId,
        accountId: input.accountId,
        amountPence: input.amountPence,
        paymentStatus: 'UNPAID',
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

    const persistedPaid = sumAmountPence(expense.payments);
    const status = derivePaymentStatus(input.amountPence, persistedPaid);
    const updated =
      status !== expense.paymentStatus
        ? await tx.expense.update({
            where: { id: expense.id },
            data: { paymentStatus: status },
            include: { account: true, payments: true },
          })
        : expense;

    if (split.cashPence > 0 && openShift) {
      const cashPayment = expense.payments.find((p: { method: string }) => p.method === 'CASH');
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

    const apCredit = Math.max(input.amountPence - persistedPaid, 0);

    await postJournalEntry({
      businessId: input.businessId,
      description: `Expense ${updated.id}`,
      referenceType: 'EXPENSE',
      referenceId: updated.id,
      lines: [
        { accountCode: updated.account.code, debitPence: input.amountPence },
        ...creditCashBankLines(split),
        apCredit > 0 ? { accountCode: ACCOUNT_CODES.ap, creditPence: apCredit } : null
      ].filter(Boolean) as JournalLine[],
      prismaClient: tx as any,
    });

    if (idempotencyKey && payloadHash) {
      await insertMoneyIdempotency(tx, {
        businessId: input.businessId,
        key: idempotencyKey,
        payloadHash,
        commandKind: 'EXPENSE_CREATE',
        resultJson: JSON.stringify({ expenseId: updated.id }),
      });
    }

    return updated;
  };

  try {
    return await prisma.$transaction(async (tx) => runCreate(tx));
  } catch (error) {
    if (idempotencyKey && payloadHash && isPrismaUniqueConstraintOn(error, ['businessId', 'key'])) {
      const winner = await findMoneyIdempotency(prisma as any, input.businessId, idempotencyKey);
      if (winner) {
        replayOrConflict(winner, { payloadHash, commandKind: 'EXPENSE_CREATE' });
        const parsed = parseIdempotencyResult<{ expenseId: string }>(winner.resultJson);
        const replayed = await loadExpenseWithPayments(input.businessId, parsed.expenseId);
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
