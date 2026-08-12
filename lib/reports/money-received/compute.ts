import {
  CONFIRMED_PAYMENT_STATUS,
  KNOWN_PAYMENT_METHODS,
  type MoneyReceivedMetricId,
  type MetricResult,
  type QualityState,
  type ReportingScopeContext,
  MONEY_RECEIVED_DEFINITION_VERSION,
} from './types';

export type ReceiptFact = {
  id: string;
  amountPence: number;
  method: string;
  status: string | null;
  receivedAt: Date;
  salesInvoiceId: string;
  branchId: string | null;
  /** Parent sale paymentStatus — for diagnostics only; must NOT exclude CONFIRMED receipts. */
  parentPaymentStatus?: string | null;
};

export type RefundFact = {
  id: string;
  amountPence: number;
  refundEffectiveAt: Date;
  salesInvoiceId: string | null;
  branchId: string | null;
};

export type MoneyMovementFacts = {
  receipts: ReceiptFact[];
  refunds: RefundFact[];
  queryFailed?: boolean;
  queryError?: string;
};

function inPeriod(at: Date, scope: ReportingScopeContext): boolean {
  const t = at.getTime();
  return t >= scope.periodStart.getTime() && t < scope.periodEndExclusive.getTime();
}

function branchOk(branchId: string | null, scope: ReportingScopeContext): boolean {
  if (scope.branchIds === null) return true;
  if (branchId === null) return false;
  return scope.branchIds.includes(branchId);
}

/** Explicit payment-method mapping for Money Received breakdowns. */
export function methodMatchesMetric(
  method: string,
  metricId: Exclude<
    MoneyReceivedMetricId,
    'money_received' | 'unverified_legacy_receipts' | 'refund_outflows'
  >,
): boolean {
  switch (metricId) {
    case 'money_received_cash':
      return method === 'CASH';
    case 'money_received_momo':
      return method === 'MOBILE_MONEY';
    case 'money_received_card':
      return method === 'CARD';
    case 'money_received_transfer':
      return method === 'TRANSFER';
    case 'money_received_other':
      return !(KNOWN_PAYMENT_METHODS as readonly string[]).includes(method);
    default:
      return false;
  }
}

export function isConfirmedReceipt(status: string | null): boolean {
  return status === CONFIRMED_PAYMENT_STATUS;
}

/**
 * Unverified legacy = not yet classified into CONFIRMED/FAILED/CANCELLED/VOID/PENDING.
 * Null (fixture / rare raw rows) and any unclassified status are unverified.
 * Confirmed receipts with an unusual *method* stay in money_received_other — that is not unverified status.
 */
export function isUnverifiedLegacyStatus(status: string | null): boolean {
  if (status === null || status === undefined) return true;
  const classified = new Set(['CONFIRMED', 'FAILED', 'CANCELLED', 'VOID', 'PENDING']);
  return !classified.has(String(status));
}

/**
 * Pure aggregation for Money Received metrics from already-scoped facts.
 * Parent RETURNED/VOID must not exclude CONFIRMED receipts (DEP-PAY-1).
 */
export function computeMoneyReceivedMetrics(
  facts: MoneyMovementFacts,
  scope: ReportingScopeContext,
): MetricResult[] {
  if (facts.queryFailed) {
    return listEmptyFailed(scope, facts.queryError ?? 'Query failed');
  }

  const confirmed = facts.receipts.filter(
    (r) =>
      inPeriod(r.receivedAt, scope) &&
      branchOk(r.branchId, scope) &&
      isConfirmedReceipt(r.status),
  );

  const unverified = facts.receipts.filter(
    (r) =>
      inPeriod(r.receivedAt, scope) &&
      branchOk(r.branchId, scope) &&
      isUnverifiedLegacyStatus(r.status),
  );

  const refunds = facts.refunds.filter(
    (r) => inPeriod(r.refundEffectiveAt, scope) && branchOk(r.branchId, scope),
  );

  const sum = (rows: { amountPence: number }[]) =>
    rows.reduce((acc, r) => acc + r.amountPence, 0);

  const moneyReceived = sum(confirmed);
  const byMethod = (metricId: Parameters<typeof methodMatchesMetric>[1]) =>
    sum(confirmed.filter((r) => methodMatchesMetric(r.method, metricId)));

  const unverifiedSum = sum(unverified);
  const refundSum = sum(refunds);

  const base = (metricId: MoneyReceivedMetricId, value: number, count: number, quality: QualityState): MetricResult => ({
    metricId,
    valuePence: value,
    currency: scope.currency,
    businessId: scope.businessId,
    branchIds: scope.branchIds,
    timeZone: scope.timeZone,
    periodStart: scope.periodStart,
    periodEndExclusive: scope.periodEndExclusive,
    asOf: scope.asOf,
    qualityState: quality,
    dependencyReason: null,
    sourceRevision: `${scope.definitionVersion}@${scope.asOf.toISOString()}`,
    definitionVersion: MONEY_RECEIVED_DEFINITION_VERSION,
    recordCount: count,
  });

  return [
    base('money_received', moneyReceived, confirmed.length, 'COMPLETE'),
    base('money_received_cash', byMethod('money_received_cash'), confirmed.filter((r) => methodMatchesMetric(r.method, 'money_received_cash')).length, 'COMPLETE'),
    base('money_received_momo', byMethod('money_received_momo'), confirmed.filter((r) => methodMatchesMetric(r.method, 'money_received_momo')).length, 'COMPLETE'),
    base('money_received_card', byMethod('money_received_card'), confirmed.filter((r) => methodMatchesMetric(r.method, 'money_received_card')).length, 'COMPLETE'),
    base('money_received_transfer', byMethod('money_received_transfer'), confirmed.filter((r) => methodMatchesMetric(r.method, 'money_received_transfer')).length, 'COMPLETE'),
    base('money_received_other', byMethod('money_received_other'), confirmed.filter((r) => methodMatchesMetric(r.method, 'money_received_other')).length, 'COMPLETE'),
    base(
      'unverified_legacy_receipts',
      unverifiedSum,
      unverified.length,
      unverified.length > 0 ? 'UNVERIFIED' : 'COMPLETE',
    ),
    base('refund_outflows', refundSum, refunds.length, 'COMPLETE'),
  ];
}

function listEmptyFailed(scope: ReportingScopeContext, reason: string): MetricResult[] {
  const ids: MoneyReceivedMetricId[] = [
    'money_received',
    'money_received_cash',
    'money_received_momo',
    'money_received_card',
    'money_received_transfer',
    'money_received_other',
    'unverified_legacy_receipts',
    'refund_outflows',
  ];
  return ids.map((metricId) => ({
    metricId,
    valuePence: null,
    currency: scope.currency,
    businessId: scope.businessId,
    branchIds: scope.branchIds,
    timeZone: scope.timeZone,
    periodStart: scope.periodStart,
    periodEndExclusive: scope.periodEndExclusive,
    asOf: scope.asOf,
    qualityState: 'QUERY_FAILED' as QualityState,
    dependencyReason: reason,
    sourceRevision: `${scope.definitionVersion}@failed`,
    definitionVersion: MONEY_RECEIVED_DEFINITION_VERSION,
    recordCount: 0,
  }));
}

/** Gate-only: no canonical numerical result for DEP-PAY-3 / DEP-SALE-1 metrics. */
export function gatedMetricResult(
  metricId: string,
  dependencyId: string,
  scope: ReportingScopeContext,
): MetricResult {
  return {
    metricId,
    valuePence: null,
    currency: scope.currency,
    businessId: scope.businessId,
    branchIds: scope.branchIds,
    timeZone: scope.timeZone,
    periodStart: scope.periodStart,
    periodEndExclusive: scope.periodEndExclusive,
    asOf: scope.asOf,
    qualityState: 'UNAVAILABLE UNTIL DEPENDENCY RESOLVED',
    dependencyReason: dependencyId,
    sourceRevision: `${scope.definitionVersion}@gated`,
    definitionVersion: MONEY_RECEIVED_DEFINITION_VERSION,
    recordCount: 0,
  };
}

/**
 * Filter helper used by DB query and tests: CONFIRMED receipts in period.
 * Intentionally does NOT filter parent SalesInvoice RETURNED/VOID.
 */
export function confirmedReceiptWhereClauseShape(): {
  status: typeof CONFIRMED_PAYMENT_STATUS;
  parentSaleFilterForbidden: true;
} {
  return { status: CONFIRMED_PAYMENT_STATUS, parentSaleFilterForbidden: true };
}
