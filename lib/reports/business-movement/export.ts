import { buildOwnerInsightSummary } from './insight-engine';
import { formatGhPence } from './insight-format';
import { ownerInsightCopy, ownerPeriodLabels } from './owner-copy';
import {
  BUSINESS_MOVEMENT_DEFINITION_VERSION,
  STOCK_AVAILABILITY_READINESS,
  type BusinessMovementWithMoneyResult,
  type ChangePair,
} from './types';

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Prefix spreadsheet-sensitive cells so Excel/Sheets do not execute formulas. */
export function spreadsheetSafeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/^[=+\-@]/.test(text) || text.startsWith('\t')) {
    return `'${text}`;
  }
  return text;
}

function formatMajor(pence: number | null | undefined): string {
  if (pence === null || pence === undefined) return '';
  return (pence / 100).toFixed(2);
}

function pushLine(cols: Array<string | number | null | undefined>): string {
  return `${cols.map((c) => csvEscape(spreadsheetSafeCell(c))).join(',')}\n`;
}

function changeCols(section: string, metric: string, pair: ChangePair): string {
  return pushLine([
    section,
    metric,
    pair.current,
    formatMajor(pair.current),
    pair.comparison,
    formatMajor(pair.comparison),
    pair.absoluteChange,
    formatMajor(pair.absoluteChange),
    pair.percentageChange == null ? '' : pair.percentageChange.toFixed(4),
    pair.percentageChangeStatus,
  ]);
}

/**
 * Complete Business Movement export: metadata, headlines, insights, movers, leakage.
 * Finite in-memory sections (aggregates only) — still marked COMPLETE_STREAM.
 * Never emits PARTIAL_EXPORT_CAP.
 */
export async function* iterBusinessMovementExportCsvChunks(
  result: BusinessMovementWithMoneyResult,
  options?: { businessName?: string | null },
): AsyncGenerator<string, void, unknown> {
  const { scope, headline, money, leakage } = result;
  const p = scope.periods;
  const summary = buildOwnerInsightSummary(result);

  yield pushLine(['section', 'field', 'value']);
  yield pushLine(['meta', 'report', 'Business Movement']);
  yield pushLine(['meta', 'businessId', scope.businessId]);
  if (options?.businessName) {
    yield pushLine(['meta', 'businessName', options.businessName]);
  }
  yield pushLine([
    'meta',
    'branchScope',
    scope.branchIds === null ? 'ALL' : scope.branchIds.join('|'),
  ]);
  yield pushLine(['meta', 'currency', scope.currency]);
  yield pushLine(['meta', 'timeZone', p.timeZone]);
  yield pushLine(['meta', 'periodPreset', p.preset]);
  yield pushLine(['meta', 'currentFromKey', p.currentFromKey]);
  yield pushLine(['meta', 'currentToKey', p.currentToKey]);
  yield pushLine(['meta', 'comparisonFromKey', p.comparisonFromKey]);
  yield pushLine(['meta', 'comparisonToKey', p.comparisonToKey]);
  const labels = ownerPeriodLabels(p);
  yield pushLine(['meta', 'currentPeriodLabel', labels.currentFull]);
  yield pushLine(['meta', 'comparisonPeriodLabel', labels.comparisonFull]);
  yield pushLine(['meta', 'comparingLine', labels.comparingLine]);
  yield pushLine(['meta', 'currentRangeKeys', labels.currentRangeKeys]);
  yield pushLine(['meta', 'comparisonRangeKeys', labels.comparisonRangeKeys]);
  yield pushLine(['meta', 'currentStart', p.currentStart.toISOString()]);
  yield pushLine(['meta', 'currentEndExclusive', p.currentEndExclusive.toISOString()]);
  yield pushLine(['meta', 'comparisonStart', p.comparisonStart.toISOString()]);
  yield pushLine(['meta', 'comparisonEndExclusive', p.comparisonEndExclusive.toISOString()]);
  yield pushLine(['meta', 'asOf', scope.asOf.toISOString()]);
  yield pushLine(['meta', 'definitionVersion', BUSINESS_MOVEMENT_DEFINITION_VERSION]);
  yield pushLine(['meta', 'moneyReceivedDefinitionVersion', money.moneyReceivedDefinitionVersion]);
  yield pushLine(['meta', 'stockAvailabilityReadiness', STOCK_AVAILABILITY_READINESS]);
  yield pushLine([
    'meta',
    'stockDisclaimer',
    'Historical stock availability is not yet reliable. This report does not attribute sales movement to stock-outs or inventory gaps.',
  ]);
  yield pushLine(['meta', 'moneyQueryFailed', result.moneyQueryFailed ? 'YES' : 'NO']);
  yield pushLine(['meta', 'moneyQueryError', result.moneyQueryError ?? '']);
  yield pushLine(['meta', 'exportCompleteness', 'COMPLETE_STREAM']);

  yield pushLine([
    'section',
    'metric',
    'currentPence',
    'currentMajor',
    'comparisonPence',
    'comparisonMajor',
    'absoluteChangePence',
    'absoluteChangeMajor',
    'percentageChange',
    'percentageChangeStatus',
  ]);
  yield changeCols('headline', 'salesValuePence', headline.salesValuePence);
  yield changeCols('headline', 'transactionCount', headline.transactionCount);
  yield changeCols('headline', 'unitsSold', headline.unitsSold);
  yield changeCols('headline', 'moneyReceived', money.moneyReceived);
  yield changeCols('headline', 'refundOutflows', money.refundOutflows);
  yield changeCols('headline', 'saleAmendMoneyOut', money.saleAmendMoneyOut);
  yield changeCols('headline', 'needsMomoConfirmation', money.needsMomoConfirmation);
  yield pushLine([
    'headline',
    'salesMinusMoneyReceivedCurrentPence',
    leakage.salesMinusMoneyReceivedCurrentPence ?? '',
    formatMajor(leakage.salesMinusMoneyReceivedCurrentPence),
    leakage.salesMinusMoneyReceivedComparisonPence ?? '',
    formatMajor(leakage.salesMinusMoneyReceivedComparisonPence),
    leakage.salesVsMoneyReceivedGapChangePence ?? '',
    formatMajor(leakage.salesVsMoneyReceivedGapChangePence),
    '',
    '',
  ]);

  yield pushLine([
    'section',
    'insightRank',
    'id',
    'category',
    'severity',
    'confidence',
    'fact',
    'evidence',
    'signal',
    'recommendedCheck',
    'rankScore',
  ]);
  for (let index = 0; index < summary.insights.length; index += 1) {
    const insight = summary.insights[index]!;
    const copy = ownerInsightCopy(insight, labels);
    yield pushLine([
      'owner_insight',
      index + 1,
      insight.id,
      insight.category,
      insight.severity,
      insight.confidence,
      copy.fact,
      copy.evidence,
      copy.signal,
      copy.recommendedCheck,
      insight.rankScore,
    ]);
  }

  yield pushLine([
    'section',
    'list',
    'productId',
    'productName',
    'kind',
    'currentPence',
    'comparisonPence',
    'absoluteChangePence',
    'percentageChange',
    'qtyCurrent',
    'qtyComparison',
    'contribution',
  ]);
  for (const row of [...result.productGrowers, ...result.productDecliners]) {
    yield pushLine([
      'product_mover',
      row.kind === 'new' || row.salesValuePence.absoluteChange >= 0 ? 'grower' : 'decliner',
      row.productId,
      row.productName,
      row.kind,
      row.salesValuePence.current,
      row.salesValuePence.comparison,
      row.salesValuePence.absoluteChange,
      row.salesValuePence.percentageChange == null
        ? ''
        : row.salesValuePence.percentageChange.toFixed(4),
      row.qtyBase.current,
      row.qtyBase.comparison,
      row.contributionToSalesChange == null ? '' : row.contributionToSalesChange.toFixed(6),
    ]);
  }

  yield pushLine([
    'section',
    'storeId',
    'storeName',
    'kind',
    'currentPence',
    'comparisonPence',
    'absoluteChangePence',
    'percentageChange',
    'txCurrent',
    'txComparison',
    'contribution',
  ]);
  for (const row of result.branches) {
    yield pushLine([
      'branch',
      row.storeId,
      row.storeName,
      row.kind,
      row.salesValuePence.current,
      row.salesValuePence.comparison,
      row.salesValuePence.absoluteChange,
      row.salesValuePence.percentageChange == null
        ? ''
        : row.salesValuePence.percentageChange.toFixed(4),
      row.transactionCount.current,
      row.transactionCount.comparison,
      row.contributionToSalesChange == null ? '' : row.contributionToSalesChange.toFixed(6),
    ]);
  }

  yield pushLine([
    'section',
    'cashierUserId',
    'cashierName',
    'kind',
    'currentPence',
    'comparisonPence',
    'absoluteChangePence',
    'percentageChange',
    'txCurrent',
    'txComparison',
    'contribution',
  ]);
  for (const row of result.cashiers) {
    yield pushLine([
      'cashier',
      row.cashierUserId,
      row.cashierName,
      row.kind,
      row.salesValuePence.current,
      row.salesValuePence.comparison,
      row.salesValuePence.absoluteChange,
      row.salesValuePence.percentageChange == null
        ? ''
        : row.salesValuePence.percentageChange.toFixed(4),
      row.transactionCount.current,
      row.transactionCount.comparison,
      row.contributionToSalesChange == null ? '' : row.contributionToSalesChange.toFixed(6),
    ]);
  }

  yield pushLine(['section', 'noteIndex', 'note']);
  for (let i = 0; i < leakage.languageNotes.length; i += 1) {
    yield pushLine(['leakage_note', i + 1, leakage.languageNotes[i]!]);
  }
  yield pushLine([
    'leakage',
    'salesMinusMoneyReceivedCurrent',
    leakage.salesMinusMoneyReceivedCurrentPence == null
      ? ''
      : formatGhPence(leakage.salesMinusMoneyReceivedCurrentPence),
  ]);
  yield pushLine([
    'meta',
    'ownerInsightCount',
    summary.insights.length,
  ]);
  yield pushLine([
    'meta',
    'productMoverCount',
    result.productGrowers.length + result.productDecliners.length,
  ]);
  yield pushLine(['meta', 'branchCount', result.branches.length]);
  yield pushLine(['meta', 'cashierCount', result.cashiers.length]);
  yield pushLine(['meta', 'exportCompleteness', 'COMPLETE_STREAM']);
}
