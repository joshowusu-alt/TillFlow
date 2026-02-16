/**
 * Shared payment-related helpers used across services.
 *
 * Centralises the repeated "split payments by method and build journal lines"
 * logic that was previously copy-pasted in sales, purchases, payments and
 * expense-payment services.
 */

import { ACCOUNT_CODES } from '@/lib/accounting';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';

export type PaymentInput = {
  method: PaymentMethod;
  amountPence: number;
  reference?: string | null;
};

export type PaymentStatus = 'PAID' | 'PART_PAID' | 'UNPAID';

export type PaymentSplit = {
  cashPence: number;
  bankPence: number; // card + transfer + mobile money
  totalPence: number;
};

export type JournalLine = {
  accountCode: string;
  debitPence?: number;
  creditPence?: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Keep only payments with a positive amount. */
export function filterPositivePayments(payments: PaymentInput[]): PaymentInput[] {
  return payments.filter((p) => p.amountPence > 0);
}

/** Split an array of payments into cash vs bank (card + transfer) totals. */
export function splitPayments(payments: PaymentInput[]): PaymentSplit {
  const cashPence = payments
    .filter((p) => p.method === 'CASH')
    .reduce((sum, p) => sum + p.amountPence, 0);
  const bankPence = payments
    .filter((p) => p.method !== 'CASH')
    .reduce((sum, p) => sum + p.amountPence, 0);
  return { cashPence, bankPence, totalPence: cashPence + bankPence };
}

/** Derive the correct payment status from total and paid amounts. */
export function derivePaymentStatus(totalPence: number, paidPence: number): PaymentStatus {
  if (paidPence <= 0) return 'UNPAID';
  if (paidPence >= totalPence) return 'PAID';
  return 'PART_PAID';
}

// ---------------------------------------------------------------------------
// Journal-line builders
// ---------------------------------------------------------------------------

/**
 * Build the debit-side journal lines for cash/bank receipts.
 * Returns null entries for zero amounts — caller should `.filter(Boolean)`.
 */
export function debitCashBankLines(split: PaymentSplit): (JournalLine | null)[] {
  return [
    split.cashPence > 0
      ? { accountCode: ACCOUNT_CODES.cash, debitPence: split.cashPence }
      : null,
    split.bankPence > 0
      ? { accountCode: ACCOUNT_CODES.bank, debitPence: split.bankPence }
      : null
  ];
}

/**
 * Build the credit-side journal lines for cash/bank disbursements.
 */
export function creditCashBankLines(split: PaymentSplit): (JournalLine | null)[] {
  return [
    split.cashPence > 0
      ? { accountCode: ACCOUNT_CODES.cash, creditPence: split.cashPence }
      : null,
    split.bankPence > 0
      ? { accountCode: ACCOUNT_CODES.bank, creditPence: split.bankPence }
      : null
  ];
}
