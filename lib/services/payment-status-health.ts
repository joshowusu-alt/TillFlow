import { prisma } from '@/lib/prisma';
import { derivePaymentStatus } from './shared';

type InvoiceKind = 'sales' | 'purchase';

type InvoiceStatusRow = {
  id: string;
  paymentStatus: string;
  totalPence: number;
  payments: Array<{ amountPence: number }>;
};

export type PaymentStatusIssue = {
  kind: InvoiceKind;
  invoiceId: string;
  currentStatus: string;
  expectedStatus: 'PAID' | 'PART_PAID' | 'UNPAID';
  totalPence: number;
  paidPence: number;
  outstandingPence: number;
  repairable: boolean;
};

export type PaymentStatusHealth = {
  issueCount: number;
  repairableCount: number;
  salesIssues: PaymentStatusIssue[];
  purchaseIssues: PaymentStatusIssue[];
};

function toIssue(kind: InvoiceKind, invoice: InvoiceStatusRow): PaymentStatusIssue | null {
  if (['RETURNED', 'VOID'].includes(invoice.paymentStatus)) return null;

  const paidPence = invoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
  const expectedStatus = derivePaymentStatus(invoice.totalPence, paidPence);
  if (expectedStatus === invoice.paymentStatus) return null;

  const repairable =
    invoice.paymentStatus !== 'PAID' &&
    (expectedStatus === 'PAID' || expectedStatus === 'UNPAID');

  return {
    kind,
    invoiceId: invoice.id,
    currentStatus: invoice.paymentStatus,
    expectedStatus,
    totalPence: invoice.totalPence,
    paidPence,
    outstandingPence: Math.max(invoice.totalPence - paidPence, 0),
    repairable,
  };
}

export function buildPaymentStatusHealth(input: {
  salesInvoices: InvoiceStatusRow[];
  purchaseInvoices: InvoiceStatusRow[];
}): PaymentStatusHealth {
  const salesIssues = input.salesInvoices
    .map((invoice) => toIssue('sales', invoice))
    .filter((issue): issue is PaymentStatusIssue => issue !== null);
  const purchaseIssues = input.purchaseInvoices
    .map((invoice) => toIssue('purchase', invoice))
    .filter((issue): issue is PaymentStatusIssue => issue !== null);
  const issues = [...salesIssues, ...purchaseIssues];

  return {
    issueCount: issues.length,
    repairableCount: issues.filter((issue) => issue.repairable).length,
    salesIssues,
    purchaseIssues,
  };
}

export async function getPaymentStatusHealth(businessId: string): Promise<PaymentStatusHealth> {
  const [salesInvoices, purchaseInvoices] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { businessId, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
      select: {
        id: true,
        paymentStatus: true,
        totalPence: true,
        payments: { select: { amountPence: true } },
      },
      take: 5000,
    }),
    prisma.purchaseInvoice.findMany({
      where: { businessId, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
      select: {
        id: true,
        paymentStatus: true,
        totalPence: true,
        payments: { select: { amountPence: true } },
      },
      take: 5000,
    }),
  ]);

  return buildPaymentStatusHealth({ salesInvoices, purchaseInvoices });
}

export async function repairStalePaymentStatuses(businessId: string) {
  const health = await getPaymentStatusHealth(businessId);
  const repairable = [...health.salesIssues, ...health.purchaseIssues].filter((issue) => issue.repairable);

  if (repairable.length === 0) {
    return { updatedSales: 0, updatedPurchases: 0, skippedReview: health.issueCount };
  }

  let updatedSales = 0;
  let updatedPurchases = 0;

  await prisma.$transaction(async (tx) => {
    for (const issue of repairable) {
      if (issue.kind === 'sales') {
        const result = await tx.salesInvoice.updateMany({
          where: {
            id: issue.invoiceId,
            businessId,
            paymentStatus: issue.currentStatus,
          },
          data: { paymentStatus: issue.expectedStatus },
        });
        updatedSales += result.count;
      } else {
        const result = await tx.purchaseInvoice.updateMany({
          where: {
            id: issue.invoiceId,
            businessId,
            paymentStatus: issue.currentStatus,
          },
          data: { paymentStatus: issue.expectedStatus },
        });
        updatedPurchases += result.count;
      }
    }
  });

  return {
    updatedSales,
    updatedPurchases,
    skippedReview: health.issueCount - repairable.length,
  };
}
