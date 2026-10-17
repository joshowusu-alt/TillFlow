import type { Prisma } from '@prisma/client';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';

/** Caller holds the online-order row lock. Money received without a posted sale
 * belongs in a customer refund liability, never in sales or restored stock. */
export async function recordUnpostedOrderRefundDue(tx: Prisma.TransactionClient, order: {
  id: string; businessId: string; totalPence: number; salesInvoiceId: string | null;
  paidAt?: Date | null;
}) {
  if (order.salesInvoiceId) return;
  const existing = await tx.journalEntry.findFirst({ where: {
    businessId: order.businessId, referenceType: 'ONLINE_ORDER_REFUND_DUE', referenceId: order.id,
  }, select: { id: true } });
  if (existing) return;
  await postJournalEntry({ businessId: order.businessId,
    description: `Payment received for cancelled online order ${order.id}`,
    referenceType: 'ONLINE_ORDER_REFUND_DUE', referenceId: order.id,
    entryDate: order.paidAt ?? undefined,
    lines: [
      { accountCode: ACCOUNT_CODES.bank, debitPence: order.totalPence },
      { accountCode: ACCOUNT_CODES.customerRefundsPayable, creditPence: order.totalPence },
    ], prismaClient: tx as any,
  });
}
