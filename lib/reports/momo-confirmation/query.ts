import type { Prisma, PrismaClient } from '@prisma/client';

import { CLASSIFIED_PAYMENT_STATUSES } from '@/lib/reports/money-received';

import type {
  MomoConfirmationFilters,
  MomoConfirmationListResult,
  MomoConfirmationRow,
} from './types';
import { MOMO_CONFIRMATION_STATUS } from './types';

export type Db = PrismaClient | Prisma.TransactionClient;

export const MOMO_CONFIRMATION_PAGE_SIZE_MAX = 100;
export const MOMO_CONFIRMATION_EXPORT_PAGE_SIZE = 500;

function branchInvoiceFilter(filters: MomoConfirmationFilters): Prisma.SalesInvoiceWhereInput {
  return {
    businessId: filters.businessId,
    ...(filters.branchIds !== null ? { storeId: { in: filters.branchIds } } : {}),
    ...(filters.saleStatus && filters.saleStatus !== 'ALL'
      ? { paymentStatus: filters.saleStatus }
      : {}),
    ...(filters.cashierUserId && filters.cashierUserId !== 'ALL'
      ? { cashierUserId: filters.cashierUserId }
      : {}),
  };
}

/**
 * Same inclusion set as unverified_legacy_receipts (status not classified),
 * optionally narrowed to one status (default UI: PENDING_MANUAL).
 */
export function momoConfirmationPaymentWhere(
  filters: MomoConfirmationFilters,
): Prisma.SalesPaymentWhereInput {
  const statusFilter =
    filters.status && filters.status !== 'ALL'
      ? { status: filters.status }
      : { status: { notIn: [...CLASSIFIED_PAYMENT_STATUSES] } };

  return {
    ...statusFilter,
    receivedAt: { gte: filters.periodStart, lt: filters.periodEndExclusive },
    salesInvoice: branchInvoiceFilter(filters),
  };
}

function mapRow(r: {
  id: string;
  amountPence: number;
  method: string;
  status: string;
  receiptOrigin: string | null;
  reference: string | null;
  network: string | null;
  receivedAt: Date;
  salesInvoiceId: string;
  salesInvoice: {
    transactionNumber: string | null;
    paymentStatus: string;
    storeId: string;
    store: { name: string };
    cashierUserId: string | null;
    cashierUser: { name: string | null } | null;
    customer: { name: string | null } | null;
  };
}): MomoConfirmationRow {
  return {
    paymentId: r.id,
    receivedAt: r.receivedAt,
    amountPence: r.amountPence,
    method: r.method,
    status: r.status,
    receiptOrigin: r.receiptOrigin,
    reference: r.reference,
    network: r.network,
    salesInvoiceId: r.salesInvoiceId,
    transactionNumber: r.salesInvoice.transactionNumber,
    saleStatus: r.salesInvoice.paymentStatus,
    storeId: r.salesInvoice.storeId,
    storeName: r.salesInvoice.store.name,
    cashierUserId: r.salesInvoice.cashierUserId,
    cashierName: r.salesInvoice.cashierUser?.name ?? null,
    customerName: r.salesInvoice.customer?.name ?? null,
  };
}

const rowSelect = {
  id: true,
  amountPence: true,
  method: true,
  status: true,
  receiptOrigin: true,
  reference: true,
  network: true,
  receivedAt: true,
  salesInvoiceId: true,
  salesInvoice: {
    select: {
      transactionNumber: true,
      paymentStatus: true,
      storeId: true,
      store: { select: { name: true } },
      cashierUserId: true,
      cashierUser: { select: { name: true } },
      customer: { select: { name: true } },
    },
  },
} as const;

export async function listMomoConfirmationPayments(
  db: Db,
  filters: MomoConfirmationFilters,
  page: number,
  pageSize: number,
): Promise<MomoConfirmationListResult> {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(Math.max(1, pageSize), MOMO_CONFIRMATION_PAGE_SIZE_MAX);
  const where = momoConfirmationPaymentWhere(filters);

  try {
    const [totalCount, sumAgg, rows] = await Promise.all([
      db.salesPayment.count({ where }),
      db.salesPayment.aggregate({
        where,
        _sum: { amountPence: true },
      }),
      db.salesPayment.findMany({
        where,
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        skip: (safePage - 1) * safeSize,
        take: safeSize,
        select: rowSelect,
      }),
    ]);

    return {
      rows: rows.map(mapRow),
      totalCount,
      totalAmountPence: sumAgg._sum.amountPence ?? 0,
      page: safePage,
      pageSize: safeSize,
      totalPages: Math.max(1, Math.ceil(totalCount / safeSize)),
    };
  } catch (err) {
    return {
      rows: [],
      totalCount: 0,
      totalAmountPence: 0,
      page: safePage,
      pageSize: safeSize,
      totalPages: 1,
      queryFailed: true,
      queryError: err instanceof Error ? err.message : 'Query failed',
    };
  }
}

export async function* iterMomoConfirmationExportCsvChunks(
  db: Db,
  filters: MomoConfirmationFilters,
  options?: { pageSize?: number; currency?: string },
): AsyncGenerator<string, void, unknown> {
  const pageSize = options?.pageSize ?? MOMO_CONFIRMATION_EXPORT_PAGE_SIZE;
  const currency = options?.currency ?? 'GHS';
  const where = momoConfirmationPaymentWhere(filters);

  const escape = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (/^[=+\-@]/.test(text) || text.startsWith('\t')) {
      return csvEscape(`'${text}`);
    }
    return csvEscape(text);
  };
  function csvEscape(text: string) {
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }
  const line = (cols: Array<string | number | null | undefined>) =>
    `${cols.map((c) => escape(c)).join(',')}\n`;

  yield line(['section', 'field', 'value']);
  yield line(['meta', 'report', 'MoMo Confirmation Review']);
  yield line(['meta', 'businessId', filters.businessId]);
  yield line([
    'meta',
    'branchScope',
    filters.branchIds === null ? 'ALL' : filters.branchIds.join('|'),
  ]);
  yield line(['meta', 'currency', currency]);
  yield line(['meta', 'periodStart', filters.periodStart.toISOString()]);
  yield line(['meta', 'periodEndExclusive', filters.periodEndExclusive.toISOString()]);
  yield line(['meta', 'statusFilter', filters.status ?? 'ALL']);
  yield line(['meta', 'saleStatusFilter', filters.saleStatus ?? 'ALL']);
  yield line(['meta', 'cashierFilter', filters.cashierUserId ?? 'ALL']);
  yield line(['meta', 'note', 'These payments are not included in Money Received until CONFIRMED.']);
  yield line(['meta', 'exportCompleteness', 'COMPLETE_STREAM']);

  yield line([
    'section',
    'receivedAt',
    'storeName',
    'cashierName',
    'transactionNumber',
    'customerName',
    'method',
    'status',
    'saleStatus',
    'amountPence',
    'amount',
    'paymentId',
  ]);

  let page = 1;
  let exported = 0;
  let sum = 0;
  for (;;) {
    const rows = await db.salesPayment.findMany({
      where,
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: rowSelect,
    });
    if (rows.length === 0) break;
    for (const raw of rows) {
      const r = mapRow(raw);
      exported += 1;
      sum += r.amountPence;
      yield line([
        'row',
        r.receivedAt.toISOString(),
        r.storeName,
        r.cashierName,
        r.transactionNumber,
        r.customerName,
        r.method,
        r.status,
        r.saleStatus,
        r.amountPence,
        (r.amountPence / 100).toFixed(2),
        r.paymentId,
      ]);
    }
    if (rows.length < pageSize) break;
    page += 1;
  }

  yield line(['meta', 'exportedRowCount', exported]);
  yield line(['meta', 'exportedSumPence', sum]);
  yield line(['meta', 'exportCompleteness', 'COMPLETE_STREAM']);
}

/** Active staff options for the cashier filter (business-scoped). */
export async function listMomoConfirmationCashiers(
  db: Db,
  businessId: string,
): Promise<{ id: string; name: string }[]> {
  const users = await db.user.findMany({
    where: {
      businessId,
      active: true,
      role: { in: ['CASHIER', 'MANAGER', 'OWNER'] },
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 200,
  });
  return users.map((u) => ({ id: u.id, name: u.name || u.id }));
}

export function defaultMomoConfirmationStatusFilter(): string {
  return MOMO_CONFIRMATION_STATUS;
}
