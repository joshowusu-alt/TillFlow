import {
  isConfirmedReceipt,
  isUnverifiedLegacyStatus,
  methodMatchesMetric,
  type MoneyMovementFacts,
} from './compute';
import type { MoneyReceivedDrillRow, MoneyReceivedMetricId, ReportingScopeContext } from './types';

function inPeriod(at: Date, scope: ReportingScopeContext): boolean {
  const t = at.getTime();
  return t >= scope.periodStart.getTime() && t < scope.periodEndExclusive.getTime();
}

function branchOk(branchId: string | null, scope: ReportingScopeContext): boolean {
  if (scope.branchIds === null) return true;
  if (branchId === null) return false;
  return scope.branchIds.includes(branchId);
}

/**
 * DrillDownTraceabilityService — paginated rows that reconcile to headline.
 * Pagination must not change totals (caller uses compute for totals).
 */
export function buildMoneyReceivedDrillRows(
  facts: MoneyMovementFacts,
  scope: ReportingScopeContext,
  metricId: MoneyReceivedMetricId,
): MoneyReceivedDrillRow[] {
  if (facts.queryFailed) return [];

  if (metricId === 'refund_outflows') {
    return facts.refunds
      .filter((r) => inPeriod(r.refundEffectiveAt, scope) && branchOk(r.branchId, scope))
      .map((r) => ({
        sourceType: 'SalesReturnRefund' as const,
        sourceId: r.id,
        amountPence: r.amountPence,
        method: null,
        status: null,
        eventAt: r.refundEffectiveAt,
        salesInvoiceId: r.salesInvoiceId,
        branchId: r.branchId,
        includedInMetricId: 'refund_outflows' as const,
      }))
      .sort((a, b) => b.eventAt.getTime() - a.eventAt.getTime());
  }

  if (metricId === 'unverified_legacy_receipts') {
    return facts.receipts
      .filter(
        (r) =>
          inPeriod(r.receivedAt, scope) &&
          branchOk(r.branchId, scope) &&
          isUnverifiedLegacyStatus(r.status),
      )
      .map((r) => ({
        sourceType: 'SalesPayment' as const,
        sourceId: r.id,
        amountPence: r.amountPence,
        method: r.method,
        status: r.status,
        eventAt: r.receivedAt,
        salesInvoiceId: r.salesInvoiceId,
        branchId: r.branchId,
        includedInMetricId: 'unverified_legacy_receipts' as const,
      }))
      .sort((a, b) => b.eventAt.getTime() - a.eventAt.getTime());
  }

  const confirmed = facts.receipts.filter(
    (r) =>
      inPeriod(r.receivedAt, scope) &&
      branchOk(r.branchId, scope) &&
      isConfirmedReceipt(r.status),
  );

  const filtered =
    metricId === 'money_received'
      ? confirmed
      : confirmed.filter((r) =>
          methodMatchesMetric(
            r.method,
            metricId as
              | 'money_received_cash'
              | 'money_received_momo'
              | 'money_received_card'
              | 'money_received_transfer'
              | 'money_received_other',
          ),
        );

  return filtered
    .map((r) => ({
      sourceType: 'SalesPayment' as const,
      sourceId: r.id,
      amountPence: r.amountPence,
      method: r.method,
      status: r.status,
      eventAt: r.receivedAt,
      salesInvoiceId: r.salesInvoiceId,
      branchId: r.branchId,
      includedInMetricId: metricId,
    }))
    .sort((a, b) => b.eventAt.getTime() - a.eventAt.getTime());
}

export function paginateDrillRows<T>(
  rows: T[],
  page: number,
  pageSize: number,
): { rows: T[]; totalCount: number; page: number; pageSize: number; totalPages: number } {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(Math.max(1, pageSize), 100);
  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / safeSize));
  const start = (safePage - 1) * safeSize;
  return {
    rows: rows.slice(start, start + safeSize),
    totalCount,
    page: safePage,
    pageSize: safeSize,
    totalPages,
  };
}

export function drillSumPence(rows: { amountPence: number }[]): number {
  return rows.reduce((s, r) => s + r.amountPence, 0);
}
