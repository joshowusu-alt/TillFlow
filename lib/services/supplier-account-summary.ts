import { prisma } from '@/lib/prisma';
import { payableDocumentBalance } from '@/lib/reports/payables-balance';

type AccountInvoice = {
  createdAt: Date;
  paymentStatus: string;
  totalPence: number;
  returnCreditPence?: number;
  payments: { amountPence: number; paidAt: Date }[];
};

export function summarizeSupplierAccount(invoices: AccountInvoice[]) {
  let outstandingPence = 0;
  let totalBilledPence = 0;
  let totalPaidPence = 0;
  let unpaidInvoiceCount = 0;
  let lastPaymentAt: Date | null = null;
  for (const invoice of invoices) {
    for (const payment of invoice.payments) {
      if (!lastPaymentAt || payment.paidAt > lastPaymentAt) lastPaymentAt = payment.paidAt;
    }
    const balance = payableDocumentBalance(invoice);
    outstandingPence += balance.balancePence;
    if (balance.balancePence > 0) unpaidInvoiceCount++;
    if (!['RETURNED', 'VOID'].includes(invoice.paymentStatus)) {
      totalBilledPence += invoice.totalPence - (invoice.returnCreditPence ?? 0);
      totalPaidPence += balance.paidPence;
    }
  }
  return { outstandingPence, totalBilledPence, totalPaidPence, unpaidInvoiceCount, invoiceCount: invoices.length, lastPaymentAt };
}

/** Account totals must never depend on the visible history limit or date filter.
 * Selection uses purchase creation dates and all payments recorded against those
 * purchases; it is not a reconstruction of the balance at a historical date.
 */
export async function getSupplierAccountSummary(businessId: string, supplierId: string, range: { start?: Date | null; endExclusive?: Date | null } = {}) {
  const invoices = await prisma.purchaseInvoice.findMany({
    where: { businessId, supplierId },
    select: {
      createdAt: true, paymentStatus: true, totalPence: true, returnCreditPence: true,
      payments: { select: { amountPence: true, paidAt: true } },
    },
  });
  const selected = invoices.filter(invoice => (!range.start || invoice.createdAt >= range.start)
    && (!range.endExclusive || invoice.createdAt < range.endExclusive));
  return { account: summarizeSupplierAccount(invoices), selection: summarizeSupplierAccount(selected) };
}
