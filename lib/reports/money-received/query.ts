import type { Prisma, PrismaClient } from '@prisma/client';

import { methodMatchesMetric } from './compute';
import {
  CONFIRMED_PAYMENT_STATUS,
  KNOWN_PAYMENT_METHODS,
  type MoneyReceivedDrillRow,
  type MoneyReceivedMetricId,
  type ReportingScopeContext,
} from './types';

export type Db = PrismaClient | Prisma.TransactionClient;

/** Statuses that are classified (not unverified legacy). Contract §5.27. */
export const CLASSIFIED_PAYMENT_STATUSES = [
  'CONFIRMED',
  'FAILED',
  'CANCELLED',
  'VOID',
  'PENDING',
] as const;

export const DRILL_PAGE_SIZE_MAX = 100;
export const EXPORT_PAGE_SIZE = 500;

export type DrillPageRequest = {
  metricId: MoneyReceivedMetricId;
  page: number;
  pageSize: number;
};

export type DrillPageResult = {
  rows: MoneyReceivedDrillRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  queryFailed?: boolean;
  queryError?: string;
  /** Prisma args actually used — for query-shape tests. */
  queryShape: {
    skip: number;
    take: number;
    orderBy: unknown;
    whereHasBusinessId: boolean;
    whereHasPeriod: boolean;
    whereHasStatusPredicate: boolean;
    whereHasParentReturnedVoid: boolean;
  };
};

function branchInvoiceFilter(scope: ReportingScopeContext): Prisma.SalesInvoiceWhereInput {
  const base: Prisma.SalesInvoiceWhereInput = { businessId: scope.businessId };
  if (scope.branchIds !== null) {
    base.storeId = { in: scope.branchIds };
  }
  return base;
}

function confirmedPaymentWhere(scope: ReportingScopeContext): Prisma.SalesPaymentWhereInput {
  return {
    status: CONFIRMED_PAYMENT_STATUS,
    receivedAt: { gte: scope.periodStart, lt: scope.periodEndExclusive },
    salesInvoice: branchInvoiceFilter(scope),
  };
}

function unverifiedPaymentWhere(scope: ReportingScopeContext): Prisma.SalesPaymentWhereInput {
  // Unverified = not yet classified into CONFIRMED/FAILED/CANCELLED/VOID/PENDING.
  // Schema status is non-null String; null cannot normally be stored. Do not invent
  // empty-string conventions — unclassified statuses are the detectable control set.
  return {
    status: { notIn: [...CLASSIFIED_PAYMENT_STATUSES] },
    receivedAt: { gte: scope.periodStart, lt: scope.periodEndExclusive },
    salesInvoice: branchInvoiceFilter(scope),
  };
}

function refundWhere(scope: ReportingScopeContext): Prisma.SalesReturnWhereInput {
  return {
    type: 'RETURN',
    createdAt: { gte: scope.periodStart, lt: scope.periodEndExclusive },
    store: {
      businessId: scope.businessId,
      ...(scope.branchIds !== null ? { id: { in: scope.branchIds } } : {}),
    },
    refundAmountPence: { gt: 0 },
  };
}

function methodFilter(
  metricId: Exclude<
    MoneyReceivedMetricId,
    'money_received' | 'unverified_legacy_receipts' | 'refund_outflows'
  >,
): Prisma.SalesPaymentWhereInput {
  switch (metricId) {
    case 'money_received_cash':
      return { method: 'CASH' };
    case 'money_received_momo':
      return { method: 'MOBILE_MONEY' };
    case 'money_received_card':
      return { method: 'CARD' };
    case 'money_received_transfer':
      return { method: 'TRANSFER' };
    case 'money_received_other':
      return { method: { notIn: [...KNOWN_PAYMENT_METHODS] } };
    default:
      return {};
  }
}

export function paymentWhereForMetric(
  scope: ReportingScopeContext,
  metricId: MoneyReceivedMetricId,
): Prisma.SalesPaymentWhereInput | null {
  if (metricId === 'refund_outflows') return null;
  if (metricId === 'unverified_legacy_receipts') return unverifiedPaymentWhere(scope);
  if (metricId === 'money_received') return confirmedPaymentWhere(scope);
  return {
    ...confirmedPaymentWhere(scope),
    ...methodFilter(metricId),
  };
}

/**
 * Headline money_received via DB aggregate. No parent RETURNED/VOID filter.
 * Empty success → 0; query failure → queryFailed (caller must not treat as zero).
 */
export async function aggregateMoneyReceivedPence(
  db: Db,
  scope: ReportingScopeContext,
): Promise<{ moneyReceivedPence: number; recordCount: number; queryFailed?: boolean; queryError?: string }> {
  try {
    const agg = await db.salesPayment.aggregate({
      where: confirmedPaymentWhere(scope),
      _sum: { amountPence: true },
      _count: { id: true },
    });
    return {
      moneyReceivedPence: agg._sum.amountPence ?? 0,
      recordCount: agg._count.id,
    };
  } catch (err) {
    return {
      moneyReceivedPence: 0,
      recordCount: 0,
      queryFailed: true,
      queryError: err instanceof Error ? err.message : 'Query failed',
    };
  }
}

export async function aggregateMoneyReceivedByMethod(
  db: Db,
  scope: ReportingScopeContext,
): Promise<{ method: string; amountPence: number }[] | { queryFailed: true; queryError: string }> {
  try {
    const rows = await db.salesPayment.groupBy({
      by: ['method'],
      where: confirmedPaymentWhere(scope),
      _sum: { amountPence: true },
    });
    return rows.map((r) => ({ method: r.method, amountPence: r._sum.amountPence ?? 0 }));
  } catch (err) {
    return {
      queryFailed: true,
      queryError: err instanceof Error ? err.message : 'Query failed',
    };
  }
}

export async function aggregateRefundOutflowsPence(
  db: Db,
  scope: ReportingScopeContext,
): Promise<{ refundOutflowsPence: number; recordCount: number; queryFailed?: boolean; queryError?: string }> {
  try {
    const agg = await db.salesReturn.aggregate({
      where: refundWhere(scope),
      _sum: { refundAmountPence: true },
      _count: { id: true },
    });
    return {
      refundOutflowsPence: agg._sum.refundAmountPence ?? 0,
      recordCount: agg._count.id,
    };
  } catch (err) {
    return {
      refundOutflowsPence: 0,
      recordCount: 0,
      queryFailed: true,
      queryError: err instanceof Error ? err.message : 'Query failed',
    };
  }
}

export async function aggregateUnverifiedLegacyPence(
  db: Db,
  scope: ReportingScopeContext,
): Promise<{ unverifiedPence: number; recordCount: number; queryFailed?: boolean; queryError?: string }> {
  try {
    const agg = await db.salesPayment.aggregate({
      where: unverifiedPaymentWhere(scope),
      _sum: { amountPence: true },
      _count: { id: true },
    });
    return {
      unverifiedPence: agg._sum.amountPence ?? 0,
      recordCount: agg._count.id,
    };
  } catch (err) {
    return {
      unverifiedPence: 0,
      recordCount: 0,
      queryFailed: true,
      queryError: err instanceof Error ? err.message : 'Query failed',
    };
  }
}

export async function aggregateMetricPence(
  db: Db,
  scope: ReportingScopeContext,
  metricId: MoneyReceivedMetricId,
): Promise<{ valuePence: number; recordCount: number; queryFailed?: boolean; queryError?: string }> {
  if (metricId === 'refund_outflows') {
    const r = await aggregateRefundOutflowsPence(db, scope);
    return {
      valuePence: r.refundOutflowsPence,
      recordCount: r.recordCount,
      queryFailed: r.queryFailed,
      queryError: r.queryError,
    };
  }
  if (metricId === 'unverified_legacy_receipts') {
    const r = await aggregateUnverifiedLegacyPence(db, scope);
    return {
      valuePence: r.unverifiedPence,
      recordCount: r.recordCount,
      queryFailed: r.queryFailed,
      queryError: r.queryError,
    };
  }
  if (metricId === 'money_received') {
    const r = await aggregateMoneyReceivedPence(db, scope);
    return {
      valuePence: r.moneyReceivedPence,
      recordCount: r.recordCount,
      queryFailed: r.queryFailed,
      queryError: r.queryError,
    };
  }
  try {
    const where = paymentWhereForMetric(scope, metricId);
    const agg = await db.salesPayment.aggregate({
      where: where!,
      _sum: { amountPence: true },
      _count: { id: true },
    });
    return {
      valuePence: agg._sum.amountPence ?? 0,
      recordCount: agg._count.id,
    };
  } catch (err) {
    return {
      valuePence: 0,
      recordCount: 0,
      queryFailed: true,
      queryError: err instanceof Error ? err.message : 'Query failed',
    };
  }
}

/**
 * Confirmed receipts through asOf (inclusive) — shared inclusion rules for liquid-asset
 * consumers that need receipt history, not a period money_received window.
 */
export async function aggregateConfirmedReceiptsThroughAsOf(
  db: Db,
  args: { businessId: string; asOf: Date; storeId?: string },
): Promise<{ amountPence: number; queryFailed?: boolean; queryError?: string }> {
  try {
    const agg = await db.salesPayment.aggregate({
      where: {
        status: CONFIRMED_PAYMENT_STATUS,
        receivedAt: { lte: args.asOf },
        salesInvoice: {
          businessId: args.businessId,
          ...(args.storeId ? { storeId: args.storeId } : {}),
        },
      },
      _sum: { amountPence: true },
    });
    return { amountPence: agg._sum.amountPence ?? 0 };
  } catch (err) {
    return {
      amountPence: 0,
      queryFailed: true,
      queryError: err instanceof Error ? err.message : 'Query failed',
    };
  }
}

function assertNoParentReturnedVoid(where: unknown): boolean {
  const text = JSON.stringify(where);
  return /RETURNED/.test(text) && /VOID/.test(text) && /paymentStatus/.test(text);
}

/**
 * True database pagination for drill-down.
 * Bounded offset pagination with deterministic orderBy (eventAt desc, id desc).
 * Limitation: large offsets scan skipped rows in the DB engine; prefer small page sizes.
 */
export async function fetchDrillPage(
  db: Db,
  scope: ReportingScopeContext,
  request: DrillPageRequest,
): Promise<DrillPageResult> {
  const page = Math.max(1, request.page);
  const pageSize = Math.min(Math.max(1, request.pageSize), DRILL_PAGE_SIZE_MAX);
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  try {
    if (request.metricId === 'refund_outflows') {
      const where = refundWhere(scope);
      const orderBy: Prisma.SalesReturnOrderByWithRelationInput[] = [
        { createdAt: 'desc' },
        { id: 'desc' },
      ];
      const [totalCount, rows] = await Promise.all([
        db.salesReturn.count({ where }),
        db.salesReturn.findMany({
          where,
          orderBy,
          skip,
          take,
          select: {
            id: true,
            refundAmountPence: true,
            createdAt: true,
            salesInvoiceId: true,
            storeId: true,
            salesInvoice: { select: { transactionNumber: true } },
          },
        }),
      ]);
      return {
        rows: rows.map((r) => ({
          sourceType: 'SalesReturnRefund' as const,
          sourceId: r.id,
          amountPence: r.refundAmountPence,
          method: null,
          status: null,
          eventAt: r.createdAt,
          salesInvoiceId: r.salesInvoiceId,
          transactionNumber: r.salesInvoice?.transactionNumber ?? null,
          branchId: r.storeId,
          includedInMetricId: 'refund_outflows' as const,
        })),
        page,
        pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
        queryShape: {
          skip,
          take,
          orderBy,
          whereHasBusinessId: true,
          whereHasPeriod: true,
          whereHasStatusPredicate: false,
          whereHasParentReturnedVoid: assertNoParentReturnedVoid(where),
        },
      };
    }

    const where = paymentWhereForMetric(scope, request.metricId)!;
    const orderBy: Prisma.SalesPaymentOrderByWithRelationInput[] = [
      { receivedAt: 'desc' },
      { id: 'desc' },
    ];
    const [totalCount, rows] = await Promise.all([
      db.salesPayment.count({ where }),
      db.salesPayment.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          amountPence: true,
          method: true,
          status: true,
          receivedAt: true,
          salesInvoiceId: true,
          salesInvoice: { select: { storeId: true, businessId: true, transactionNumber: true } },
        },
      }),
    ]);

    return {
      rows: rows
        .filter((r) => r.salesInvoice.businessId === scope.businessId)
        .map((r) => ({
          sourceType: 'SalesPayment' as const,
          sourceId: r.id,
          amountPence: r.amountPence,
          method: r.method,
          status: r.status,
          eventAt: r.receivedAt,
          salesInvoiceId: r.salesInvoiceId,
          transactionNumber: r.salesInvoice.transactionNumber,
          branchId: r.salesInvoice.storeId,
          includedInMetricId: request.metricId,
        })),
      page,
      pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      queryShape: {
        skip,
        take,
        orderBy,
        whereHasBusinessId: true,
        whereHasPeriod: true,
        whereHasStatusPredicate: true,
        whereHasParentReturnedVoid: assertNoParentReturnedVoid(where),
      },
    };
  } catch (err) {
    return {
      rows: [],
      page,
      pageSize,
      totalCount: 0,
      totalPages: 1,
      queryFailed: true,
      queryError: err instanceof Error ? err.message : 'Query failed',
      queryShape: {
        skip,
        take,
        orderBy: null,
        whereHasBusinessId: true,
        whereHasPeriod: true,
        whereHasStatusPredicate: true,
        whereHasParentReturnedVoid: false,
      },
    };
  }
}

/** Iterate all matching drill rows in bounded DB pages (for complete export). */
export async function* iterateDrillPages(
  db: Db,
  scope: ReportingScopeContext,
  metricId: MoneyReceivedMetricId,
  pageSize = EXPORT_PAGE_SIZE,
): AsyncGenerator<MoneyReceivedDrillRow[], void, unknown> {
  let page = 1;
  for (;;) {
    const result = await fetchDrillPage(db, scope, { metricId, page, pageSize });
    if (result.queryFailed) {
      throw new Error(result.queryError ?? 'Money Received drill-down query failed');
    }
    if (result.rows.length === 0) return;
    yield result.rows;
    if (page >= result.totalPages) return;
    page += 1;
  }
}

/** Map groupBy methods into canonical method metric values. */
export function methodBreakdownFromGroupBy(
  rows: { method: string; amountPence: number }[],
): Record<
  | 'money_received_cash'
  | 'money_received_momo'
  | 'money_received_card'
  | 'money_received_transfer'
  | 'money_received_other',
  number
> {
  const out = {
    money_received_cash: 0,
    money_received_momo: 0,
    money_received_card: 0,
    money_received_transfer: 0,
    money_received_other: 0,
  };
  for (const row of rows) {
    if (methodMatchesMetric(row.method, 'money_received_cash')) out.money_received_cash += row.amountPence;
    else if (methodMatchesMetric(row.method, 'money_received_momo')) out.money_received_momo += row.amountPence;
    else if (methodMatchesMetric(row.method, 'money_received_card')) out.money_received_card += row.amountPence;
    else if (methodMatchesMetric(row.method, 'money_received_transfer')) out.money_received_transfer += row.amountPence;
    else out.money_received_other += row.amountPence;
  }
  return out;
}

/**
 * Consumer helper: never convert a Money Received aggregation failure into an empty/zero split.
 */
export function requireMoneyReceivedMethodRows(
  rows: { method: string; amountPence: number }[] | { queryFailed: true; queryError: string },
): { method: string; amountPence: number }[] {
  if ('queryFailed' in rows) {
    throw new Error(rows.queryError ?? 'Money Received method aggregation failed');
  }
  return rows;
}
