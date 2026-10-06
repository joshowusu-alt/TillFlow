import { receivableDocumentBalance, type ReceivableDocument } from './receivables-balance';

type CustomerDocument = ReceivableDocument & {
  customer: { id: string; name: string } | null;
};

/** Presentation reconciliation only. Never confirms payments or reallocates receipts. */
export function reconcileCustomerDebt(invoices: CustomerDocument[]) {
  const accounts = new Map<string, { id: string; name: string; balancePence: number }>();
  let customerInvoiceDuePence = 0;
  let customerExcessPence = 0;
  let unlinkedDuePence = 0;
  let unlinkedExcessPence = 0;
  let unlinkedInvoiceCount = 0;
  for (const invoice of invoices) {
    const { balancePence } = receivableDocumentBalance(invoice);
    if (invoice.customer) {
      const account = accounts.get(invoice.customer.id) ?? { ...invoice.customer, balancePence: 0 };
      account.balancePence += balancePence;
      accounts.set(account.id, account);
      customerInvoiceDuePence += Math.max(0, balancePence);
      customerExcessPence += Math.max(0, -balancePence);
    } else {
      unlinkedDuePence += Math.max(0, balancePence);
      unlinkedExcessPence += Math.max(0, -balancePence);
      if (balancePence !== 0) unlinkedInvoiceCount++;
    }
  }
  const customerBalancePence = customerInvoiceDuePence - customerExcessPence;
  const accountRows = [...accounts.values()];
  const customerDuePence = accountRows.reduce((sum, account) => sum + Math.max(0, account.balancePence), 0);
  const customerCreditPence = accountRows.reduce((sum, account) => sum + Math.max(0, -account.balancePence), 0);
  return {
    accounts: accountRows, customerBalancePence, customerDuePence, customerCreditPence,
    customerInvoiceDuePence, customerExcessPence,
    unlinkedDuePence, unlinkedExcessPence, unlinkedInvoiceCount,
    documentBalancePence: customerBalancePence + unlinkedDuePence - unlinkedExcessPence,
  };
}
