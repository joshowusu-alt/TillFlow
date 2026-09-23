/**
 * Customer document balance. Not stamped authoritative v1.
 * Only SalesPayment.status = CONFIRMED reduces the balance.
 * A negative balancePence is a reconciling excess, not a silent zero.
 */
export type ReceivablePayment = {
  amountPence: number;
  status: string;
};

export type ReceivableDocument = {
  paymentStatus: string;
  totalPence: number;
  payments: ReceivablePayment[];
};

export type DocumentBalance = {
  paidPence: number;
  balancePence: number;
  excessPence: number;
};

const CLOSED = new Set(['RETURNED', 'VOID']);

export function receivableDocumentBalance(invoice: ReceivableDocument): DocumentBalance {
  if (CLOSED.has(invoice.paymentStatus)) {
    return { paidPence: 0, balancePence: 0, excessPence: 0 };
  }
  const paidPence = invoice.payments.reduce(
    (sum, payment) => sum + (payment.status === 'CONFIRMED' ? payment.amountPence : 0),
    0,
  );
  const balancePence = invoice.totalPence - paidPence;
  return {
    paidPence,
    balancePence,
    excessPence: balancePence < 0 ? -balancePence : 0,
  };
}

export function sumReceivableBalances(invoices: ReceivableDocument[]): number {
  return invoices.reduce((sum, invoice) => sum + receivableDocumentBalance(invoice).balancePence, 0);
}
