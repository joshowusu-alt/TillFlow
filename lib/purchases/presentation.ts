import { getDueDateStatus } from '@/lib/due-date-status';
import { payableDocumentBalance, type PayableDocument } from '@/lib/reports/payables-balance';

export function purchaseStatus(invoice: PayableDocument & { dueDate?: Date | null }, now = new Date()) {
  const { balancePence, paidPence } = payableDocumentBalance(invoice);
  if (balancePence <= 0) return 'Paid';
  if (getDueDateStatus(invoice.dueDate, now).state === 'OVERDUE') return 'Overdue';
  return paidPence > 0 ? 'Part paid' : 'Owing';
}

export function purchasePaymentMethod(method: string) {
  return ({ CASH: 'Cash', CARD: 'Card', TRANSFER: 'Bank', BANK_TRANSFER: 'Bank', MOBILE_MONEY: 'Mobile Money', MOMO: 'Mobile Money' } as Record<string, string>)[method] ?? 'Other payment';
}
