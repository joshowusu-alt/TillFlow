import { ACCOUNT_CODES } from '@/lib/accounting';
import type { JournalLine, PaymentInput } from '@/lib/services/shared/payment-utils';

/** Explicit forward-only contract, independent of receiptOrigin and timestamps. */
export const RECEIPT_LEDGER_V1 = 'CONFIRMED_RECEIPTS_AR_V1';

export function isPendingMomo(payment: { method: string; status?: string | null }): boolean {
  return payment.method === 'MOBILE_MONEY' && payment.status !== 'CONFIRMED';
}

export function receiptLedgerFields(payment: { method: string; status?: string | null }) {
  return {
    ledgerTreatment: RECEIPT_LEDGER_V1,
    confirmedAt: isPendingMomo(payment) ? null : new Date(),
  };
}

/** A pending tender is exposure in AR, not money in Bank. No clearing duplication. */
export function settledReceiptSplit(payments: PaymentInput[]) {
  let cashPence = 0;
  let bankPence = 0;
  for (const payment of payments) {
    if (isPendingMomo(payment)) continue;
    if (payment.method === 'CASH') cashPence += payment.amountPence;
    else bankPence += payment.amountPence;
  }
  return { cashPence, bankPence, totalPence: cashPence + bankPence };
}

export function pendingMomoConfirmationLines(amountPence: number): JournalLine[] {
  if (!Number.isSafeInteger(amountPence) || amountPence <= 0) throw new Error('Invalid pending receipt amount');
  return [
    { accountCode: ACCOUNT_CODES.bank, debitPence: amountPence },
    { accountCode: ACCOUNT_CODES.ar, creditPence: amountPence },
  ];
}
