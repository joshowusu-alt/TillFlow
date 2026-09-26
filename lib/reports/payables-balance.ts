/**
 * Supplier document balance. PurchasePayment has no status column.
 * Every stored amountPence counts. A PurchaseReturn refund is not subtracted again.
 * A negative balancePence is a reconciling excess, not a silent zero.
 */
export type PayableDocument = {
  paymentStatus: string;
  totalPence: number;
  payments: Array<{ amountPence: number }>;
  refundAmountPence?: number | null;
};

export type PayableBalance = {
  paidPence: number;
  balancePence: number;
  excessPence: number;
};

const CLOSED = new Set(['RETURNED', 'VOID']);

export function payableDocumentBalance(invoice: PayableDocument): PayableBalance {
  if (CLOSED.has(invoice.paymentStatus)) {
    return { paidPence: 0, balancePence: 0, excessPence: 0 };
  }
  const paidPence = invoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
  const balancePence = invoice.totalPence - paidPence;
  return {
    paidPence,
    balancePence,
    excessPence: balancePence < 0 ? -balancePence : 0,
  };
}

export function sumPayableBalances(invoices: PayableDocument[]): number {
  return invoices.reduce((sum, invoice) => sum + payableDocumentBalance(invoice).balancePence, 0);
}
