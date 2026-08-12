import { prisma } from '@/lib/prisma';

import {
  computeMoneyReceivedMetrics,
  gatedMetricResult,
  type MoneyMovementFacts,
} from './compute';
import { qualityForMoneyReceivedBundle } from './quality';
import {
  aggregateMoneyReceivedByMethod,
  aggregateMoneyReceivedPence,
  aggregateRefundOutflowsPence,
  aggregateUnverifiedLegacyPence,
  fetchDrillPage,
  methodBreakdownFromGroupBy,
  type Db,
  type DrillPageResult,
} from './query';
import {
  reconcileMethodBreakdownToMoneyReceived,
  reconcileMoneyReceivedToDetailSum,
} from './reconcile';
import { getMoneyReceivedMetricDefinition } from './registry';
import { resolveMoneyReceivedScope, type ResolveMoneyReceivedScopeInput } from './scope-clock';
import {
  MONEY_RECEIVED_DEFINITION_VERSION,
  type MetricResult,
  type MoneyReceivedMetricId,
  type QualityState,
  type ReconcileResult,
  type ReportingScopeContext,
} from './types';

export type MoneyReceivedBundle = {
  scope: ReportingScopeContext;
  results: MetricResult[];
  byId: Record<string, MetricResult>;
  quality: ReturnType<typeof qualityForMoneyReceivedBundle>;
  methodReconcile: ReconcileResult;
  /** Present only for fixture/pure-path tests — never used for UI pagination. */
  facts?: MoneyMovementFacts;
  source: 'database-aggregates' | 'fixture-facts';
};

function metricBase(
  scope: ReportingScopeContext,
  metricId: string,
  valuePence: number | null,
  recordCount: number,
  qualityState: QualityState,
  dependencyReason: string | null = null,
): MetricResult {
  return {
    metricId,
    valuePence,
    currency: scope.currency,
    businessId: scope.businessId,
    branchIds: scope.branchIds,
    timeZone: scope.timeZone,
    periodStart: scope.periodStart,
    periodEndExclusive: scope.periodEndExclusive,
    asOf: scope.asOf,
    qualityState,
    dependencyReason,
    sourceRevision: `${scope.definitionVersion}@${scope.asOf.toISOString()}`,
    definitionVersion: MONEY_RECEIVED_DEFINITION_VERSION,
    recordCount,
  };
}

function failedBundle(scope: ReportingScopeContext, reason: string): MoneyReceivedBundle {
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
  const results = ids.map((id) => metricBase(scope, id, null, 0, 'QUERY_FAILED', reason));
  return {
    scope,
    results,
    byId: Object.fromEntries(results.map((r) => [r.metricId, r])),
    quality: qualityForMoneyReceivedBundle(results),
    methodReconcile: { ok: false, reason: 'QUERY_FAILED', headlinePence: null, detailSumPence: null },
    source: 'database-aggregates',
  };
}

/** Canonical computation from DB aggregates — does not load all receipt rows. */
export async function computeMoneyReceivedBundleFromDb(
  db: Db,
  input: ResolveMoneyReceivedScopeInput,
): Promise<MoneyReceivedBundle> {
  const scope = resolveMoneyReceivedScope(input);

  const [mr, methods, unverified, refunds] = await Promise.all([
    aggregateMoneyReceivedPence(db, scope),
    aggregateMoneyReceivedByMethod(db, scope),
    aggregateUnverifiedLegacyPence(db, scope),
    aggregateRefundOutflowsPence(db, scope),
  ]);

  if (mr.queryFailed || 'queryFailed' in methods || unverified.queryFailed || refunds.queryFailed) {
    const reason =
      mr.queryError ||
      ('queryError' in methods ? methods.queryError : undefined) ||
      unverified.queryError ||
      refunds.queryError ||
      'Query failed';
    return failedBundle(scope, reason);
  }

  const methodRows = methods as { method: string; amountPence: number }[];
  const breakdown = methodBreakdownFromGroupBy(methodRows);

  const results: MetricResult[] = [
    metricBase(scope, 'money_received', mr.moneyReceivedPence, mr.recordCount, 'COMPLETE'),
    metricBase(scope, 'money_received_cash', breakdown.money_received_cash, 0, 'COMPLETE'),
    metricBase(scope, 'money_received_momo', breakdown.money_received_momo, 0, 'COMPLETE'),
    metricBase(scope, 'money_received_card', breakdown.money_received_card, 0, 'COMPLETE'),
    metricBase(scope, 'money_received_transfer', breakdown.money_received_transfer, 0, 'COMPLETE'),
    metricBase(scope, 'money_received_other', breakdown.money_received_other, 0, 'COMPLETE'),
    metricBase(
      scope,
      'unverified_legacy_receipts',
      unverified.unverifiedPence,
      unverified.recordCount,
      unverified.recordCount > 0 ? 'UNVERIFIED' : 'COMPLETE',
    ),
    metricBase(scope, 'refund_outflows', refunds.refundOutflowsPence, refunds.recordCount, 'COMPLETE'),
  ];

  const byId = Object.fromEntries(results.map((r) => [r.metricId, r]));
  return {
    scope,
    results,
    byId,
    quality: qualityForMoneyReceivedBundle(results),
    methodReconcile: reconcileMethodBreakdownToMoneyReceived(results),
    source: 'database-aggregates',
  };
}

/** Fixture/pure path for conformance tests — not used by product surface pagination. */
export function computeMoneyReceivedBundleFromFacts(
  input: ResolveMoneyReceivedScopeInput,
  facts: MoneyMovementFacts,
): MoneyReceivedBundle {
  const scope = resolveMoneyReceivedScope(input);
  const results = computeMoneyReceivedMetrics(facts, scope);
  const byId = Object.fromEntries(results.map((r) => [r.metricId, r]));
  return {
    scope,
    results,
    byId,
    quality: qualityForMoneyReceivedBundle(results),
    methodReconcile: reconcileMethodBreakdownToMoneyReceived(results),
    facts,
    source: 'fixture-facts',
  };
}

export async function computeMoneyReceivedBundle(
  input: ResolveMoneyReceivedScopeInput,
  factsOverride?: MoneyMovementFacts,
): Promise<MoneyReceivedBundle> {
  if (factsOverride) {
    return computeMoneyReceivedBundleFromFacts(input, factsOverride);
  }
  return computeMoneyReceivedBundleFromDb(prisma, input);
}

export function getGatedMoneyMetric(
  metricId: string,
  scope: ReportingScopeContext,
): MetricResult {
  const def = getMoneyReceivedMetricDefinition(metricId);
  if (!def || !def.gated || !def.dependencyId) {
    return gatedMetricResult(metricId, 'UNKNOWN_DEPENDENCY', scope);
  }
  return gatedMetricResult(metricId, def.dependencyId, scope);
}

/**
 * DB-paginated drill-down. Headline totals come from bundle aggregates, not the page.
 * Query failure is explicit — never presented as an empty successful page.
 */
export async function drillDownForMetric(
  db: Db,
  bundle: MoneyReceivedBundle,
  metricId: MoneyReceivedMetricId,
  page = 1,
  pageSize = 50,
): Promise<{
  page: DrillPageResult;
  detailSumPenceFromAggregate: number | null;
  reconcile: ReconcileResult;
}> {
  const pageResult = await fetchDrillPage(db, bundle.scope, { metricId, page, pageSize });
  if (pageResult.queryFailed) {
    return {
      page: pageResult,
      detailSumPenceFromAggregate: null,
      reconcile: {
        ok: false,
        reason: 'QUERY_FAILED',
        headlinePence: null,
        detailSumPence: null,
      },
    };
  }

  const headline = bundle.byId[metricId];
  const detailSumPenceFromAggregate =
    headline?.qualityState === 'QUERY_FAILED' ? null : (headline?.valuePence ?? null);
  const reconcile =
    headline &&
    detailSumPenceFromAggregate !== null &&
    headline.qualityState !== 'QUERY_FAILED'
      ? reconcileMoneyReceivedToDetailSum(headline, detailSumPenceFromAggregate, bundle.scope)
      : {
          ok: false,
          reason: headline?.qualityState === 'QUERY_FAILED' ? 'QUERY_FAILED' : 'MISSING_HEADLINE',
          headlinePence: null,
          detailSumPence: null,
        };

  return {
    page: pageResult,
    detailSumPenceFromAggregate,
    reconcile,
  };
}

export type { ResolveMoneyReceivedScopeInput };
