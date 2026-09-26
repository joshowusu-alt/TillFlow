import { payableDocumentBalance, type PayableDocument } from '@/lib/reports/payables-balance';
import { receivableDocumentBalance, type ReceivableDocument } from '@/lib/reports/receivables-balance';

export type OpenDocumentSummary = {
  outstandingPence: number;
  paidShortfallPence: number;
  signedExcessPence: number;
};

function summarize(
  rows: Array<{ paymentStatus: string; balancePence: number; isClosed: boolean }>,
): OpenDocumentSummary {
  const active = rows.filter((row) => !row.isClosed);
  return {
    outstandingPence: active.reduce((sum, row) => sum + row.balancePence, 0),
    paidShortfallPence: active
      .filter((row) => row.paymentStatus === 'PAID' && row.balancePence > 0)
      .reduce((sum, row) => sum + row.balancePence, 0),
    signedExcessPence: active
      .filter((row) => row.balancePence < 0)
      .reduce((sum, row) => sum + row.balancePence, 0),
  };
}

/** Customer statement, detail, and receipt totals. Closed documents contribute nothing. */
export function summarizeOpenReceivables(invoices: ReceivableDocument[]): OpenDocumentSummary {
  return summarize(invoices.map((invoice) => {
    const document = receivableDocumentBalance(invoice);
    return {
      paymentStatus: invoice.paymentStatus,
      balancePence: document.balancePence,
      isClosed: invoice.paymentStatus === 'RETURNED' || invoice.paymentStatus === 'VOID',
    };
  }));
}

/** Supplier statement, detail, and payment totals. Closed documents contribute nothing. */
export function summarizeOpenPayables(invoices: PayableDocument[]): OpenDocumentSummary {
  return summarize(invoices.map((invoice) => {
    const document = payableDocumentBalance(invoice);
    return {
      paymentStatus: invoice.paymentStatus,
      balancePence: document.balancePence,
      isClosed: invoice.paymentStatus === 'RETURNED' || invoice.paymentStatus === 'VOID',
    };
  }));
}
