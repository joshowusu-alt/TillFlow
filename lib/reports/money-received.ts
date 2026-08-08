import { prisma } from '@/lib/prisma';
import {
  REPORTING_EXCLUDED_PAYMENT_STATUSES,
  REPORTING_EXCLUDED_SALE_STATUSES,
  reportingTimestampFilter,
  type ReportingScope,
} from '@/lib/reports/reporting-scope';
import {
  classifySalesPaymentReceipt,
  RECEIPT_CLASSIFICATION_LABELS,
  type ReceiptClassification,
  type ReceiptPaymentState,
} from '@/lib/reports/money-received-classify';
import {
  isReceiptOrigin,
  type ReceiptOrigin,
} from '@/lib/payments/receipt-origin';

export {
  classifySalesPaymentReceipt,
  RECEIPT_CLASSIFICATION_LABELS,
};
export type { ReceiptClassification, ReceiptPaymentState };

export const SUPPORTED_RECEIPT_METHODS = ['CASH', 'CARD', 'TRANSFER', 'MOBILE_MONEY'] as const;
export type ReceiptPaymentMethod = (typeof SUPPORTED_RECEIPT_METHODS)[number];

export const RECEIPT_METHOD_LABELS: Record<ReceiptPaymentMethod, string> = {
  CASH: 'Physical cash',
  MOBILE_MONEY: 'Mobile Money (MoMo)',
  CARD: 'Card',
  TRANSFER: 'Bank transfer',
};

export const SUPPORTED_RECEIPT_ORIGINS = [
  'RECEIVED_AT_SALE',
  'LATER_CREDIT_COLLECTION',
  'UNCLASSIFIED',
] as const satisfies readonly ReceiptOrigin[];

export type MoneyReceivedByMethod = Record<ReceiptPaymentMethod, number>;

export type MoneyReceivedSummary = {
  byMethod: MoneyReceivedByMethod;
  totalPence: number;
  receivedAtSalePence: number;
  laterCreditCollectionPence: number;
  /** Historical NULL / explicit UNCLASSIFIED — never inferred as a known origin. */
  unknownHistoricalOriginPence: number;
  reversalPence: number;
};

export type MoneyReceivedRow = {
  paymentId: string;
  receivedAt: Date;
  amountPence: number;
  method: string;
  methodLabel: string;
  classification: ReceiptClassification;
  classificationLabel: string;
  paymentState: ReceiptPaymentState;
  status: string;
  reference: string | null;
  network: string | null;
  payerMsisdn: string | null;
  provider: string | null;
  transactionNumber: string | null;
  invoiceId: string;
  invoiceTotalPence: number;
  invoiceCreatedAt: Date;
  storeId: string;
  storeName: string;
  tillId: string;
  tillName: string;
  cashierName: string | null;
  customerName: string | null;
};

function emptyByMethod(): MoneyReceivedByMethod {
  return { CASH: 0, CARD: 0, TRANSFER: 0, MOBILE_MONEY: 0 };
}

function isSupportedMethod(method: string): method is ReceiptPaymentMethod {
  return (SUPPORTED_RECEIPT_METHODS as readonly string[]).includes(method);
}

function originFilter(origin?: ReceiptOrigin | null) {
  if (!origin) return {};
  if (origin === 'UNCLASSIFIED') {
    return {
      OR: [{ receiptOrigin: null }, { receiptOrigin: 'UNCLASSIFIED' }],
    };
  }
  return { receiptOrigin: origin };
}

function paymentListWhere(
  scope: ReportingScope,
  method?: string | null,
  origin?: ReceiptOrigin | null,
) {
  const methodFilter =
    method && isSupportedMethod(method) ? { method } : {};

  return {
    receivedAt: reportingTimestampFilter(scope),
    status: { notIn: [...REPORTING_EXCLUDED_PAYMENT_STATUSES] },
    ...methodFilter,
    ...originFilter(origin),
    salesInvoice: {
      businessId: scope.businessId,
      ...(scope.storeId === 'ALL' ? {} : { storeId: scope.storeId }),
      paymentStatus: { notIn: [...REPORTING_EXCLUDED_SALE_STATUSES] },
    },
  };
}

/**
 * Aggregate money received from payment records for the scope.
 *
 * Origin buckets use persisted receiptOrigin only.
 * Identity (non-forced):
 *   totalPence = receivedAtSale + laterCredit + unknownHistorical + reversal
 */
export async function getMoneyReceivedSummary(scope: ReportingScope): Promise<MoneyReceivedSummary> {
  const payments = await prisma.salesPayment.findMany({
    where: paymentListWhere(scope),
    select: {
      amountPence: true,
      method: true,
      receiptOrigin: true,
    },
    // Bounded fetch for origin buckets; retail-day aggregates stay well under this.
    take: 20_000,
    orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
  });

  const byMethod = emptyByMethod();
  let totalPence = 0;
  let receivedAtSalePence = 0;
  let laterCreditCollectionPence = 0;
  let unknownHistoricalOriginPence = 0;
  let reversalPence = 0;

  for (const payment of payments) {
    if (isSupportedMethod(payment.method)) {
      byMethod[payment.method] += payment.amountPence;
    }
    totalPence += payment.amountPence;

    const { classification, paymentState } = classifySalesPaymentReceipt({
      amountPence: payment.amountPence,
      receiptOrigin: payment.receiptOrigin,
    });

    if (paymentState === 'REVERSAL') {
      reversalPence += payment.amountPence;
    } else if (classification === 'RECEIVED_AT_SALE') {
      receivedAtSalePence += payment.amountPence;
    } else if (classification === 'LATER_CREDIT_COLLECTION') {
      laterCreditCollectionPence += payment.amountPence;
    } else {
      unknownHistoricalOriginPence += payment.amountPence;
    }
  }

  return {
    byMethod,
    totalPence,
    receivedAtSalePence,
    laterCreditCollectionPence,
    unknownHistoricalOriginPence,
    reversalPence,
  };
}

export const RECEIPTS_PAGE_SIZE = 25;
export const RECEIPTS_MAX_PAGE_SIZE = 50;

export async function listMoneyReceivedPayments(input: {
  scope: ReportingScope;
  method?: string | null;
  origin?: ReceiptOrigin | null;
  page?: number;
  pageSize?: number;
}): Promise<{
  rows: MoneyReceivedRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const pageSize = Math.min(
    Math.max(input.pageSize ?? RECEIPTS_PAGE_SIZE, 1),
    RECEIPTS_MAX_PAGE_SIZE,
  );
  const requestedPage = Math.max(input.page ?? 1, 1);
  const where = paymentListWhere(input.scope, input.method, input.origin);

  const totalCount = await prisma.salesPayment.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);

  const payments = await prisma.salesPayment.findMany({
    where,
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      method: true,
      amountPence: true,
      receivedAt: true,
      reference: true,
      network: true,
      payerMsisdn: true,
      provider: true,
      status: true,
      receiptOrigin: true,
      salesInvoice: {
        select: {
          id: true,
          transactionNumber: true,
          totalPence: true,
          createdAt: true,
          storeId: true,
          tillId: true,
          store: { select: { name: true } },
          till: { select: { name: true } },
          cashierUser: { select: { name: true } },
          customer: { select: { name: true } },
        },
      },
    },
  });

  const rows: MoneyReceivedRow[] = payments.map((payment) => {
    const { classification, paymentState } = classifySalesPaymentReceipt({
      amountPence: payment.amountPence,
      receiptOrigin: payment.receiptOrigin,
    });
    const method = payment.method;
    return {
      paymentId: payment.id,
      receivedAt: payment.receivedAt,
      amountPence: payment.amountPence,
      method,
      methodLabel: isSupportedMethod(method)
        ? RECEIPT_METHOD_LABELS[method]
        : method,
      classification,
      classificationLabel: RECEIPT_CLASSIFICATION_LABELS[classification],
      paymentState,
      status: payment.status,
      reference: payment.reference,
      network: payment.network,
      payerMsisdn: payment.payerMsisdn,
      provider: payment.provider,
      transactionNumber: payment.salesInvoice.transactionNumber,
      invoiceId: payment.salesInvoice.id,
      invoiceTotalPence: payment.salesInvoice.totalPence,
      invoiceCreatedAt: payment.salesInvoice.createdAt,
      storeId: payment.salesInvoice.storeId,
      storeName: payment.salesInvoice.store.name,
      tillId: payment.salesInvoice.tillId,
      tillName: payment.salesInvoice.till.name,
      cashierName: payment.salesInvoice.cashierUser?.name ?? null,
      customerName: payment.salesInvoice.customer?.name ?? null,
    };
  });

  return { rows, totalCount, page, pageSize, totalPages };
}

/** Tenant-safe payment lookup — returns null for foreign or missing ids. */
export async function findTenantSalesPayment(input: {
  businessId: string;
  paymentId: string;
}) {
  return prisma.salesPayment.findFirst({
    where: {
      id: input.paymentId,
      salesInvoice: { businessId: input.businessId },
    },
    select: { id: true },
  });
}

export function parseReceiptMethodParam(value: string | undefined | null): ReceiptPaymentMethod | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return isSupportedMethod(trimmed) ? trimmed : null;
}

export function parseReceiptOriginParam(value: string | undefined | null): ReceiptOrigin | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return isReceiptOrigin(trimmed) ? trimmed : null;
}
