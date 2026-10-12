/**
 * On-screen qualification for a recorded MoMo tender that is not a confirmed receipt.
 * Derived from payment rows. The invoice stamp is used only to keep returned and void
 * sales from being described as awaiting confirmation.
 */

export type TenderEvidence = {
  method: string;
  amountPence: number;
  status?: string | null;
};

export type PendingMomoReceipt = {
  pendingMomoPence: number;
  label: 'MoMo confirmation pending' | null;
};

const CLOSED_INVOICE_STATUSES = new Set(['RETURNED', 'VOID']);
const AWAITING_CONFIRMATION = new Set(['PENDING_MANUAL', 'PENDING']);

export function pendingMomoReceipt(input: {
  invoiceStatus: string;
  payments: TenderEvidence[];
}): PendingMomoReceipt {
  if (CLOSED_INVOICE_STATUSES.has(input.invoiceStatus)) {
    return { pendingMomoPence: 0, label: null };
  }
  const pendingMomoPence = input.payments.reduce((sum, payment) => {
    if (payment.method !== 'MOBILE_MONEY' || payment.amountPence <= 0) return sum;
    if (!payment.status || !AWAITING_CONFIRMATION.has(payment.status)) return sum;
    return sum + payment.amountPence;
  }, 0);
  if (pendingMomoPence <= 0) return { pendingMomoPence: 0, label: null };
  return { pendingMomoPence, label: 'MoMo confirmation pending' };
}
