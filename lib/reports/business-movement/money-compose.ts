import type { Prisma, PrismaClient } from '@prisma/client';

import {
  MONEY_RECEIVED_DEFINITION_VERSION,
  computeMoneyReceivedBundleFromDb,
  paymentWhereForMetric,
  resolveMoneyReceivedScope,
  type MoneyMovementFacts,
  type ReportingScopeContext,
} from '@/lib/reports/money-received';

import {
  buildLeakageQualitySummary,
  buildMoneyMovementLayer,
  moneyPeriodFactsFromCanonicalMetrics,
  moneyPeriodFactsFromMovementFacts,
} from './money-leakage';
import {
  resolveEqualLengthPeriodPair,
  resolveLastFullCalendarMonthPair,
} from './periods';
import { computeSalesComparisonFromDb } from './query';
import type {
  BusinessMovementScope,
  BusinessMovementWithMoneyResult,
  MoneyPeriodFacts,
  SalesComparisonResult,
} from './types';

export type Db = PrismaClient | Prisma.TransactionClient;

function toMoneyReceivedScopeInput(scope: BusinessMovementScope, which: 'current' | 'comparison') {
  const p = scope.periods;
  const periodStart = which === 'current' ? p.currentStart : p.comparisonStart;
  const periodEndExclusive = which === 'current' ? p.currentEndExclusive : p.comparisonEndExclusive;
  return {
    businessId: scope.businessId,
    currency: scope.currency,
    timeZone: p.timeZone,
    periodStart,
    periodEndInclusive: periodEndExclusive,
    absoluteBounds: true as const,
    branchIds: scope.branchIds,
    asOf: scope.asOf,
  };
}

/**
 * Sale-amend money-out side metric: sum of absolute negative CONFIRMED payments
 * using the canonical money_received payment where (no formula fork of the headline).
 */
export async function aggregateSaleAmendMoneyOutPence(
  db: Db,
  scope: ReportingScopeContext,
): Promise<{ saleAmendMoneyOutPence: number; saleAmendRecordCount: number; queryFailed?: boolean; queryError?: string }> {
  try {
    const base = paymentWhereForMetric(scope, 'money_received');
    if (!base) {
      return { saleAmendMoneyOutPence: 0, saleAmendRecordCount: 0 };
    }
    const where = {
      ...base,
      amountPence: { lt: 0 },
    };
    const agg = await db.salesPayment.aggregate({
      where,
      _sum: { amountPence: true },
      _count: { id: true },
    });
    const sum = agg._sum.amountPence ?? 0;
    return {
      saleAmendMoneyOutPence: sum < 0 ? -sum : 0,
      saleAmendRecordCount: agg._count.id,
    };
  } catch (err) {
    return {
      saleAmendMoneyOutPence: 0,
      saleAmendRecordCount: 0,
      queryFailed: true,
      queryError: err instanceof Error ? err.message : 'Query failed',
    };
  }
}

export async function loadMoneyPeriodFactsFromDb(
  db: Db,
  scope: BusinessMovementScope,
  which: 'current' | 'comparison',
): Promise<{ facts: MoneyPeriodFacts; mrScope: ReportingScopeContext }> {
  const input = toMoneyReceivedScopeInput(scope, which);
  const mrScope = resolveMoneyReceivedScope(input);
  const [bundle, amend] = await Promise.all([
    computeMoneyReceivedBundleFromDb(db, input),
    aggregateSaleAmendMoneyOutPence(db, mrScope),
  ]);

  const failed =
    bundle.source === 'database-aggregates' &&
    (bundle.byId.money_received?.qualityState === 'QUERY_FAILED' ||
      amend.queryFailed === true);

  const facts = moneyPeriodFactsFromCanonicalMetrics({
    moneyReceivedPence: bundle.byId.money_received?.valuePence ?? null,
    refundOutflowsPence: bundle.byId.refund_outflows?.valuePence ?? null,
    needsMomoConfirmationPence: bundle.byId.unverified_legacy_receipts?.valuePence ?? null,
    moneyReceivedRecordCount: bundle.byId.money_received?.recordCount ?? 0,
    refundRecordCount: bundle.byId.refund_outflows?.recordCount ?? 0,
    needsMomoRecordCount: bundle.byId.unverified_legacy_receipts?.recordCount ?? 0,
    saleAmendMoneyOutPence: amend.saleAmendMoneyOutPence,
    saleAmendRecordCount: amend.saleAmendRecordCount,
    queryFailed: failed,
    queryError:
      bundle.byId.money_received?.dependencyReason ??
      amend.queryError ??
      null,
  });

  return { facts, mrScope };
}

export function composeBusinessMovementWithMoney(input: {
  sales: SalesComparisonResult;
  currentMoney: MoneyPeriodFacts;
  comparisonMoney: MoneyPeriodFacts;
  moneyReceivedDefinitionVersion?: string;
}): BusinessMovementWithMoneyResult {
  const moneyQueryFailed = Boolean(
    input.currentMoney.queryFailed || input.comparisonMoney.queryFailed,
  );
  const moneyQueryError =
    input.currentMoney.queryError || input.comparisonMoney.queryError || null;

  const money = buildMoneyMovementLayer(
    input.currentMoney,
    input.comparisonMoney,
    input.moneyReceivedDefinitionVersion ?? MONEY_RECEIVED_DEFINITION_VERSION,
  );
  const leakage = buildLeakageQualitySummary({
    salesHeadline: input.sales.headline,
    money,
  });

  return {
    ...input.sales,
    money,
    leakage,
    moneyQueryFailed,
    moneyQueryError,
  };
}

/** Pure-path compose from canonical MoneyMovementFacts (parity / unit tests). */
export function composeBusinessMovementWithMoneyFromFacts(input: {
  sales: SalesComparisonResult;
  currentFacts: MoneyMovementFacts;
  comparisonFacts: MoneyMovementFacts;
  currentMrScope: ReportingScopeContext;
  comparisonMrScope: ReportingScopeContext;
}): BusinessMovementWithMoneyResult {
  const currentMoney = moneyPeriodFactsFromMovementFacts(
    input.currentFacts,
    input.currentMrScope,
  );
  const comparisonMoney = moneyPeriodFactsFromMovementFacts(
    input.comparisonFacts,
    input.comparisonMrScope,
  );
  return composeBusinessMovementWithMoney({
    sales: input.sales,
    currentMoney,
    comparisonMoney,
    moneyReceivedDefinitionVersion: input.currentMrScope.definitionVersion,
  });
}

export async function computeBusinessMovementWithMoneyFromDb(
  db: Db,
  input: {
    businessId: string;
    currency: string;
    timeZone?: string | null;
    branchIds?: string[] | null;
    period?:
      | { preset: 'last_full_calendar_month'; asOf?: Date }
      | { preset: 'equal_length_custom'; currentFromKey: string; currentToKey: string };
    topN?: number;
    asOf?: Date;
  },
): Promise<BusinessMovementWithMoneyResult> {
  const sales = await computeSalesComparisonFromDb(db, input);
  const [currentMoney, comparisonMoney] = await Promise.all([
    loadMoneyPeriodFactsFromDb(db, sales.scope, 'current'),
    loadMoneyPeriodFactsFromDb(db, sales.scope, 'comparison'),
  ]);

  return composeBusinessMovementWithMoney({
    sales,
    currentMoney: currentMoney.facts,
    comparisonMoney: comparisonMoney.facts,
    moneyReceivedDefinitionVersion: MONEY_RECEIVED_DEFINITION_VERSION,
  });
}

// Re-export period helpers used by callers building scopes without sales compute
export { resolveEqualLengthPeriodPair, resolveLastFullCalendarMonthPair };
