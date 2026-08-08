import { Prisma } from '@prisma/client';
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

/**
 * Historical defective in-memory summary cap. Must never be used for aggregation.
 * Kept only so tests can prove we did not raise or reintroduce a row-cap workaround.
 */
export const LEGACY_MONEY_RECEIVED_SUMMARY_ROW_CAP = 20_000;

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
  totalCount: number;
  receivedAtSalePence: number;
  laterCreditCollectionPence: number;
  /** Historical NULL / explicit UNCLASSIFIED — never inferred as a known origin. */
  unknownHistoricalOriginPence: number;
  /** Sum of negative payment amounts (display / audit); already included in origin buckets. */
  reversalPence: number;
  receivedAtSaleCount: number;
  laterCreditCollectionCount: number;
  unknownHistoricalOriginCount: number;
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

function toNumber(value: bigint | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === 'bigint' ? Number(value) : value;
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

type AggregateRow = {
  total_pence: bigint;
  total_count: bigint;
  cash_pence: bigint;
  card_pence: bigint;
  transfer_pence: bigint;
  momo_pence: bigint;
  at_sale_pence: bigint;
  later_pence: bigint;
  unknown_pence: bigint;
  reversal_pence: bigint;
  at_sale_count: bigint;
  later_count: bigint;
  unknown_count: bigint;
};

/**
 * Aggregate money received from payment records for the scope.
 *
 * Complete database aggregation — never load matching payments into app memory.
 *
 * Origin buckets use persisted receiptOrigin only (NULL / invalid → unknown).
 * Identities:
 *   totalPence = Σ supported method groups (+ any unsupported method amounts still in total)
 *   totalPence = receivedAtSale + laterCredit + unknownHistorical
 *   totalCount = receivedAtSaleCount + laterCreditCount + unknownCount
 * Signed reversals remain in their origin bucket and are also surfaced as reversalPence.
 */
export async function getMoneyReceivedSummary(scope: ReportingScope): Promise<MoneyReceivedSummary> {
  const storeClause =
    scope.storeId === 'ALL'
      ? Prisma.empty
      : Prisma.sql`AND si."storeId" = ${scope.storeId}`;

  const rows = await prisma.$queryRaw<AggregateRow[]>`
    SELECT
      COALESCE(SUM(sp."amountPence"), 0)::bigint AS total_pence,
      COUNT(*)::bigint AS total_count,
      COALESCE(SUM(CASE WHEN sp.method = 'CASH' THEN sp."amountPence" ELSE 0 END), 0)::bigint AS cash_pence,
      COALESCE(SUM(CASE WHEN sp.method = 'CARD' THEN sp."amountPence" ELSE 0 END), 0)::bigint AS card_pence,
      COALESCE(SUM(CASE WHEN sp.method = 'TRANSFER' THEN sp."amountPence" ELSE 0 END), 0)::bigint AS transfer_pence,
      COALESCE(SUM(CASE WHEN sp.method = 'MOBILE_MONEY' THEN sp."amountPence" ELSE 0 END), 0)::bigint AS momo_pence,
      COALESCE(SUM(CASE WHEN sp."receiptOrigin" = 'RECEIVED_AT_SALE' THEN sp."amountPence" ELSE 0 END), 0)::bigint AS at_sale_pence,
      COALESCE(SUM(CASE WHEN sp."receiptOrigin" = 'LATER_CREDIT_COLLECTION' THEN sp."amountPence" ELSE 0 END), 0)::bigint AS later_pence,
      COALESCE(SUM(
        CASE
          WHEN sp."receiptOrigin" IS NULL
            OR sp."receiptOrigin" = ''
            OR sp."receiptOrigin" = 'UNCLASSIFIED'
            OR sp."receiptOrigin" NOT IN ('RECEIVED_AT_SALE', 'LATER_CREDIT_COLLECTION', 'UNCLASSIFIED')
          THEN sp."amountPence"
          ELSE 0
        END
      ), 0)::bigint AS unknown_pence,
      COALESCE(SUM(CASE WHEN sp."amountPence" < 0 THEN sp."amountPence" ELSE 0 END), 0)::bigint AS reversal_pence,
      COALESCE(SUM(CASE WHEN sp."receiptOrigin" = 'RECEIVED_AT_SALE' THEN 1 ELSE 0 END), 0)::bigint AS at_sale_count,
      COALESCE(SUM(CASE WHEN sp."receiptOrigin" = 'LATER_CREDIT_COLLECTION' THEN 1 ELSE 0 END), 0)::bigint AS later_count,
      COALESCE(SUM(
        CASE
          WHEN sp."receiptOrigin" IS NULL
            OR sp."receiptOrigin" = ''
            OR sp."receiptOrigin" = 'UNCLASSIFIED'
            OR sp."receiptOrigin" NOT IN ('RECEIVED_AT_SALE', 'LATER_CREDIT_COLLECTION', 'UNCLASSIFIED')
          THEN 1
          ELSE 0
        END
      ), 0)::bigint AS unknown_count
    FROM "SalesPayment" sp
    INNER JOIN "SalesInvoice" si ON si.id = sp."salesInvoiceId"
    WHERE sp."receivedAt" >= ${scope.startInclusive}
      AND sp."receivedAt" < ${scope.endExclusive}
      AND sp.status NOT IN (${Prisma.join([...REPORTING_EXCLUDED_PAYMENT_STATUSES])})
      AND si."businessId" = ${scope.businessId}
      AND si."paymentStatus" NOT IN (${Prisma.join([...REPORTING_EXCLUDED_SALE_STATUSES])})
      ${storeClause}
  `;

  const row = rows[0];
  const byMethod = emptyByMethod();
  byMethod.CASH = toNumber(row?.cash_pence);
  byMethod.CARD = toNumber(row?.card_pence);
  byMethod.TRANSFER = toNumber(row?.transfer_pence);
  byMethod.MOBILE_MONEY = toNumber(row?.momo_pence);

  return {
    byMethod,
    totalPence: toNumber(row?.total_pence),
    totalCount: toNumber(row?.total_count),
    receivedAtSalePence: toNumber(row?.at_sale_pence),
    laterCreditCollectionPence: toNumber(row?.later_pence),
    unknownHistoricalOriginPence: toNumber(row?.unknown_pence),
    reversalPence: toNumber(row?.reversal_pence),
    receivedAtSaleCount: toNumber(row?.at_sale_count),
    laterCreditCollectionCount: toNumber(row?.later_count),
    unknownHistoricalOriginCount: toNumber(row?.unknown_count),
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
