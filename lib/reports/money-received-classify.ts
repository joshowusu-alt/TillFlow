/**
 * Pure receipt classification helpers (no Prisma import).
 *
 * Classification rule (no schema field; reconstructible from existing data):
 *
 *   Checkout creates nested SalesPayment rows in the same write as the
 *   SalesInvoice, so payment.receivedAt aligns with invoice.createdAt
 *   (typically the same second). Later credit collections via
 *   recordCustomerPayment create additional SalesPayment rows afterwards.
 *
 *   RECEIVED_AT_SALE — positive payment where
 *     receivedAt - invoice.createdAt <= SALE_RECEIPT_GRACE_MS (5 minutes).
 *     Grace covers MoMo attach / clock skew inside the checkout path.
 *
 *   LATER_CREDIT_COLLECTION — positive payment outside that window.
 *
 *   Refunds/reversals use amountPence < 0 (amend/return flows) and are
 *   exposed with paymentState REVERSAL; they reduce net money received.
 *
 * Limitation (documented residual): a same-session credit collection within
 * 5 minutes of the original sale may classify as RECEIVED_AT_SALE. Without a
 * payment-source column this cannot be eliminated; do not invent certainty.
 */

export type ReceiptClassification = 'RECEIVED_AT_SALE' | 'LATER_CREDIT_COLLECTION';
export type ReceiptPaymentState = 'CONFIRMED' | 'REVERSAL' | 'OTHER';

/** Max delta between invoice.createdAt and payment.receivedAt for sale-time. */
export const SALE_RECEIPT_GRACE_MS = 5 * 60 * 1000;

export const RECEIPT_CLASSIFICATION_LABELS: Record<ReceiptClassification, string> = {
  RECEIVED_AT_SALE: 'Received at sale',
  LATER_CREDIT_COLLECTION: 'Later credit collection',
};

export function classifySalesPaymentReceipt(input: {
  amountPence: number;
  receivedAt: Date;
  invoiceCreatedAt: Date;
}): { classification: ReceiptClassification; paymentState: ReceiptPaymentState } {
  const paymentState: ReceiptPaymentState =
    input.amountPence < 0 ? 'REVERSAL' : input.amountPence > 0 ? 'CONFIRMED' : 'OTHER';

  const deltaMs = input.receivedAt.getTime() - input.invoiceCreatedAt.getTime();
  const classification: ReceiptClassification =
    deltaMs <= SALE_RECEIPT_GRACE_MS ? 'RECEIVED_AT_SALE' : 'LATER_CREDIT_COLLECTION';

  return { classification, paymentState };
}
