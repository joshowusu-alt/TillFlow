import { receivableDocumentBalance } from '@/lib/reports/receivables-balance';
import { payableDocumentBalance } from '@/lib/reports/payables-balance';

export type DetailLedgerPayment = {
  id: string;
  amountPence: number;
  status?: string | null;
  receivedAt: Date;
  method: string;
  reference: string | null;
};

export type DetailLedgerInvoice = {
  id: string;
  createdAt: Date;
  paymentStatus: string;
  totalPence: number;
  payments: DetailLedgerPayment[];
};

export type DetailLedgerRow = {
  key: string;
  date: Date;
  type: 'invoice' | 'payment' | 'adjustment';
  description: string;
  debitPence: number;
  creditPence: number;
  balancePence: number;
};

export function buildCustomerDetailLedger(invoices: DetailLedgerInvoice[]): DetailLedgerRow[] {
  return invoices
    .flatMap((invoice) => {
      const document = receivableDocumentBalance({
        paymentStatus: invoice.paymentStatus,
        totalPence: invoice.totalPence,
        payments: invoice.payments.map((payment) => ({
          amountPence: payment.amountPence,
          status: payment.status ?? '',
        })),
      });
      const isClosed = invoice.paymentStatus === 'RETURNED' || invoice.paymentStatus === 'VOID';
      return [
        {
          key: `${invoice.id}-invoice`,
          date: invoice.createdAt,
          sortKey: invoice.createdAt.getTime(),
          type: 'invoice' as const,
          description: 'Invoice',
          debitPence: isClosed ? 0 : invoice.totalPence,
          creditPence: 0,
        },
        ...invoice.payments
          .filter((payment) => payment.status === 'CONFIRMED')
          .map((payment) => ({
            key: payment.id,
            date: payment.receivedAt,
            sortKey: payment.receivedAt.getTime() + 0.1,
            type: 'payment' as const,
            description: `Payment${payment.reference ? ` - ${payment.reference}` : ''} (${payment.method})`,
            debitPence: 0,
            creditPence: payment.amountPence,
          })),
        ...(document.excessPence > 0
          ? [{
              key: `${invoice.id}-excess`,
              date: invoice.createdAt,
              sortKey: invoice.createdAt.getTime() + 0.5,
              type: 'adjustment' as const,
              description: 'Reconciling excess',
              debitPence: 0,
              creditPence: 0,
            }]
          : []),
      ];
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .reduce<DetailLedgerRow[]>((rows, row) => {
      const previousBalance = rows.at(-1)?.balancePence ?? 0;
      const { sortKey: _sortKey, ...rest } = row;
      rows.push({ ...rest, balancePence: previousBalance + row.debitPence - row.creditPence });
      return rows;
    }, []);
}

export function buildSupplierDetailLedger(invoices: DetailLedgerInvoice[]): DetailLedgerRow[] {
  return invoices
    .flatMap((invoice) => {
      const document = payableDocumentBalance({
        paymentStatus: invoice.paymentStatus,
        totalPence: invoice.totalPence,
        payments: invoice.payments.map((payment) => ({ amountPence: payment.amountPence })),
      });
      const isClosed = invoice.paymentStatus === 'RETURNED' || invoice.paymentStatus === 'VOID';
      return [
        {
          key: `${invoice.id}-invoice`,
          date: invoice.createdAt,
          sortKey: invoice.createdAt.getTime(),
          type: 'invoice' as const,
          description: 'Invoice',
          debitPence: isClosed ? 0 : invoice.totalPence,
          creditPence: 0,
        },
        ...invoice.payments.map((payment) => ({
          key: payment.id,
          date: payment.receivedAt,
          sortKey: payment.receivedAt.getTime() + 0.1,
          type: 'payment' as const,
          description: `Payment${payment.reference ? ` - ${payment.reference}` : ''} (${payment.method})`,
          debitPence: 0,
          creditPence: payment.amountPence,
        })),
        ...(document.excessPence > 0
          ? [{
              key: `${invoice.id}-excess`,
              date: invoice.createdAt,
              sortKey: invoice.createdAt.getTime() + 0.5,
              type: 'adjustment' as const,
              description: 'Reconciling excess',
              debitPence: 0,
              creditPence: 0,
            }]
          : []),
      ];
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .reduce<DetailLedgerRow[]>((rows, row) => {
      const previousBalance = rows.at(-1)?.balancePence ?? 0;
      const { sortKey: _sortKey, ...rest } = row;
      rows.push({ ...rest, balancePence: previousBalance + row.debitPence - row.creditPence });
      return rows;
    }, []);
}
