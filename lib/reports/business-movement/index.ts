export {
  absoluteChange,
  averageOrNull,
  buildChangePair,
  contributionToChange,
  percentageChange,
} from './change-math';

export {
  businessLocalParts,
  formatPeriodChromeKey,
  resolveEqualLengthPeriodPair,
  resolveLastFullCalendarMonthPair,
} from './periods';

export {
  buildSalesHeadline,
  businessMovementSalesInvoiceWhere,
  compareSalesMovement,
  type NamedSalesBucket,
  type PeriodSalesFacts,
} from './sales-comparison';

export { computeSalesComparisonFromDb, type Db } from './query';

export {
  BUSINESS_MOVEMENT_MONEY_LANGUAGE,
  BUSINESS_MOVEMENT_MONEY_LANGUAGE_NOTES,
} from './money-language';

export {
  buildLeakageQualitySummary,
  buildMoneyMovementLayer,
  isConfirmedReceipt,
  isUnverifiedLegacyStatus,
  moneyPeriodFactsFromCanonicalMetrics,
  moneyPeriodFactsFromMovementFacts,
  saleAmendMoneyOutFromFacts,
} from './money-leakage';

export {
  aggregateSaleAmendMoneyOutPence,
  composeBusinessMovementWithMoney,
  composeBusinessMovementWithMoneyFromFacts,
  computeBusinessMovementWithMoneyFromDb,
  loadMoneyPeriodFactsFromDb,
} from './money-compose';

export {
  resolveBusinessMovementPeriodInput,
  type BusinessMovementPeriodInput,
  type BusinessMovementPeriodQuery,
} from './period-params';

export {
  iterBusinessMovementExportCsvChunks,
  spreadsheetSafeCell,
} from './export';

export {
  BUSINESS_MOVEMENT_DEFINITION_VERSION,
  STOCK_AVAILABILITY_READINESS,
  type BranchMovementRow,
  type BusinessMovementInsight,
  type BusinessMovementPeriodPair,
  type BusinessMovementScope,
  type BusinessMovementWithMoneyResult,
  type CashierMovementRow,
  type ChangePair,
  type EntityMovementKind,
  type LeakageQualitySummary,
  type MoneyMovementLayer,
  type MoneyPeriodFacts,
  type ProductMovementRow,
  type SalesComparisonResult,
  type SalesHeadlineMovement,
  type StockAvailabilityReadiness,
} from './types';

export {
  DEFAULT_INSIGHT_THRESHOLDS,
  FORBIDDEN_STOCK_CAUSE_PHRASES,
  resolveInsightThresholds,
} from './insight-thresholds';

export {
  containsForbiddenStockLanguage,
  describeChangeVsComparison,
  formatGhPence,
  formatSignedGhPence,
} from './insight-format';

export {
  OWNER_CATEGORY_LABEL,
  OWNER_STOCK_DATA_NOTE,
  buildOwnerSummaryStrip,
  ownerCategoryLabel,
  ownerConfidenceHint,
  ownerPeriodChrome,
  ownerProductMovers,
  ownerWhyItMatters,
  periodMonthLabel,
  productMoverSideLabel,
  productQtyWording,
  shouldCollapseEntityTable,
  shortPeriodLabel,
  singleBranchNote,
  singleCashierNote,
  type OwnerProductMover,
  type OwnerSummaryStrip,
} from './owner-copy';

export {
  assertOwnerSummaryHasNoStockCause,
  buildOwnerInsightSummary,
  insightTextBlob,
  rankBusinessMovementInsights,
} from './insight-engine';

export type {
  InsightCategory,
  InsightConfidence,
  InsightEngineOptions,
  InsightSeverity,
  OwnerInsightSummary,
  RankedBusinessMovementInsight,
} from './insight-types';
