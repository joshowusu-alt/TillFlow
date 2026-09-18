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
import { reserveNextDocumentNumber } from './document-numbers';
import {
  assertExpenseStateMatchesAmounts,
  assertNoOverpayment,
  remainingBalancePence,
} from '@/lib/reliability/walkthrough-contracts';
import {
  assertInventoryLossExpenseAllowed,
  assertSourceAdjustmentAvailable,
  composeInventoryLossNotes,
  INVENTORY_LOSS_ADJUSTMENT_NOT_FOUND_MSG,
  INVENTORY_LOSS_DUPLICATE_ADJUSTMENT_MSG,
  isSourceAdjustmentUniqueConflict,
} from './inventory-loss-expense-guard';

export const CASH_EXPENSE_SHIFT_REQUIRED_MSG = EXPLICIT_CASH_TILL_REQUIRED_MSG;
export const EXPENSE_PAYMENT_METHOD_REQUIRED_MSG =
  'Payment method is required when an amount is paid.';

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
  inventoryLossOverride?: boolean;
  inventoryLossOverrideReason?: string | null;
  sourceAdjustmentId?: string | null;
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
  assertNoOverpayment(input.amountPence, amountPaid);
  assertExpenseStateMatchesAmounts(input.paymentStatus, input.amountPence, amountPaid);

  assertInventoryLossExpenseAllowed({
    accountCode: account.code,
    override: input.inventoryLossOverride,
    reason: input.inventoryLossOverrideReason,
  });

  const sourceAdjustmentId = input.sourceAdjustmentId?.trim() || null;
  if (sourceAdjustmentId) {
    const adjustment = await prisma.stockAdjustment.findFirst({
      where: {
        id: sourceAdjustmentId,
        store: { businessId: input.businessId },
      },
      select: { id: true },
    });
    if (!adjustment) throw new Error(INVENTORY_LOSS_ADJUSTMENT_NOT_FOUND_MSG);
    await assertSourceAdjustmentAvailable(prisma as any, sourceAdjustmentId, input.businessId);
  }

  const persistedNotes = composeInventoryLossNotes(input.notes, input.inventoryLossOverrideReason);

  const hasFirstPayment = amountPaid > 0;
  if (hasFirstPayment && !input.method) {
    throw new Error(EXPENSE_PAYMENT_METHOD_REQUIRED_MSG);
  }
  const method = hasFirstPayment ? input.method! : null;
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
        method: method ?? '',
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
      hasFirstPayment && method ? [{ method, amountPence: amountPaid }] : []
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

    const transactionNumber = await reserveNextDocumentNumber(tx, input.businessId, 'expense');
    const paymentNumber = hasFirstPayment
      ? await reserveNextDocumentNumber(tx, input.businessId, 'expense_payment')
      : null;

    if (sourceAdjustmentId) {
      await assertSourceAdjustmentAvailable(tx, sourceAdjustmentId, input.businessId);
    }

    const expense = await tx.expense.create({
      data: {
        businessId: input.businessId,
        storeId: input.storeId,
        userId: input.userId,
        accountId: input.accountId,
        amountPence: input.amountPence,
        paymentStatus: 'UNPAID',
        method: hasFirstPayment ? method : null,
        dueDate: input.dueDate ?? null,
        vendorName: input.vendorName ?? null,
        reference: input.reference ?? null,
        attachmentPath: input.attachmentPath ?? null,
        notes: persistedNotes,
        transactionNumber,
        sourceAdjustmentId,
        payments:
          hasFirstPayment && method
            ? {
                create: [
                  {
                    businessId: input.businessId,
                    storeId: input.storeId,
                    userId: input.userId,
                    method: method as string,
                    amountPence: amountPaid,
                    reference: input.reference ?? null,
                    transactionNumber: paymentNumber,
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

    const apCredit = remainingBalancePence(input.amountPence, persistedPaid);

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
    if (isSourceAdjustmentUniqueConflict(error)) {
      throw new Error(INVENTORY_LOSS_DUPLICATE_ADJUSTMENT_MSG);
    }
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
