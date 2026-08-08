/**
 * Pure receipt classification helpers for reporting (no Prisma import).
 *
 * Authoritative source: SalesPayment.receiptOrigin (PR #85 contract).
 * Reads go through resolveReceiptOrigin — historical NULL → UNCLASSIFIED.
 *
 * Do not infer origin from timestamps, payment method, drawer, or journals.
 * Do not treat UNCLASSIFIED / NULL as RECEIVED_AT_SALE or LATER_CREDIT_COLLECTION.
 */

import {
  resolveReceiptOrigin,
  type ReceiptOrigin,
} from '@/lib/payments/receipt-origin';

export type ReceiptClassification = ReceiptOrigin;
export type ReceiptPaymentState = 'CONFIRMED' | 'REVERSAL' | 'OTHER';

export const RECEIPT_CLASSIFICATION_LABELS: Record<ReceiptClassification, string> = {
  RECEIVED_AT_SALE: 'Received at sale',
  LATER_CREDIT_COLLECTION: 'Later credit collection',
  UNCLASSIFIED: 'Historical — not classified',
};

export function classifySalesPaymentReceipt(input: {
  amountPence: number;
  receiptOrigin: string | null | undefined;
}): { classification: ReceiptClassification; paymentState: ReceiptPaymentState } {
  const paymentState: ReceiptPaymentState =
    input.amountPence < 0 ? 'REVERSAL' : input.amountPence > 0 ? 'CONFIRMED' : 'OTHER';

  return {
    classification: resolveReceiptOrigin(input.receiptOrigin),
    paymentState,
  };
}
