import { postJournalEntry } from '@/lib/accounting';
import { derivePaymentStatus, splitPayments, type PaymentInput } from './shared';
import { reserveNextDocumentNumber } from './document-numbers';
import { getOpenCashShiftForPayment, recordCashDrawerEntryTx } from './cash-drawer';

/** Called only inside the purchase transaction. Tender is split, never duplicated. */
export async function recordPurchaseCostExpenseTx(tx: any, input: {
  businessId: string; storeId: string; userId: string; purchaseId: string; purchaseNumber: string;
  amountPence: number; payments: PaymentInput[]; cashAccountCode: string; useTill: boolean;
  tillId?: string | null; shiftId?: string | null; dueDate?: Date | null; note?: string | null; supplierName?: string | null;
}) {
  const split = splitPayments(input.payments);
  const account = await tx.account.findFirst({ where: { businessId: input.businessId, code: '6000', type: 'EXPENSE' }, select: { id: true } });
  if (!account) throw new Error('The operating-expense account is missing.');
  const expense = await tx.expense.create({ data: {
    businessId: input.businessId, storeId: input.storeId, userId: input.userId, accountId: account.id,
    amountPence: input.amountPence, paymentStatus: derivePaymentStatus(input.amountPence, split.totalPence),
    method: input.payments.length === 1 ? input.payments[0].method : null, dueDate: input.dueDate ?? null,
    vendorName: input.supplierName ?? null, reference: input.purchaseNumber,
    notes: input.note || `Additional cost linked to purchase ${input.purchaseNumber}`,
    transactionNumber: await reserveNextDocumentNumber(tx, input.businessId, 'expense'),
  } });
  for (const payment of input.payments) {
    const created = await tx.expensePayment.create({ data: { businessId: input.businessId, storeId: input.storeId, userId: input.userId, expenseId: expense.id, method: payment.method, amountPence: payment.amountPence, reference: payment.reference ?? null, transactionNumber: await reserveNextDocumentNumber(tx, input.businessId, 'expense_payment') } });
    if (payment.method === 'CASH' && input.useTill) {
      if (!input.tillId) throw new Error('Select an open till for the additional-cost payment.');
      const shift = await getOpenCashShiftForPayment(tx, { businessId: input.businessId, storeId: input.storeId, tillId: input.tillId, shiftId: input.shiftId });
      if (!shift) throw new Error('Select an open till for the additional-cost payment.');
      await recordCashDrawerEntryTx(tx, { businessId: input.businessId, storeId: input.storeId, tillId: shift.tillId, shiftId: shift.id, createdByUserId: input.userId, entryType: 'PAID_OUT_EXPENSE', amountPence: -payment.amountPence, reasonCode: 'PURCHASE_COST', reason: input.note || 'Purchase delivery / other cost', referenceType: 'EXPENSE_PAYMENT', referenceId: created.id });
    }
  }
  await postJournalEntry({ businessId: input.businessId, description: `Additional purchase cost ${input.purchaseNumber}`, referenceType: 'EXPENSE', referenceId: expense.id, lines: [
    { accountCode: '6000', debitPence: input.amountPence },
    ...(split.cashPence ? [{ accountCode: input.cashAccountCode, creditPence: split.cashPence }] : []),
    ...(split.bankPence ? [{ accountCode: '1010', creditPence: split.bankPence }] : []),
    ...(input.amountPence > split.totalPence ? [{ accountCode: '2000', creditPence: input.amountPence - split.totalPence }] : []),
  ], prismaClient: tx });
  await tx.purchaseInvoice.update({ where: { id: input.purchaseId }, data: { linkedCostExpenseId: expense.id } });
  return expense.id as string;
}
