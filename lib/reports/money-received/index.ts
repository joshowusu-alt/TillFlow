export type {
  MetricResult,
  MoneyReceivedMetricId,
  QualityState,
  ReportingScopeContext,
  ReconcileResult,
  MoneyReceivedDrillRow,
} from './types';
export { MONEY_RECEIVED_DEFINITION_VERSION, CONFIRMED_PAYMENT_STATUS, KNOWN_PAYMENT_METHODS } from './types';
export {
  getMoneyReceivedMetricDefinition,
  listPhase1MoneyReceivedMetricIds,
  getMoneyReceivedDefinitionVersion,
} from './registry';
export { resolveMoneyReceivedScope, scopesEqualForReconcile, businessLocalDayStart } from './scope-clock';
export {
  computeMoneyReceivedMetrics,
  gatedMetricResult,
  isConfirmedReceipt,
  isUnverifiedLegacyStatus,
  methodMatchesMetric,
  confirmedReceiptWhereClauseShape,
  type MoneyMovementFacts,
  type ReceiptFact,
  type RefundFact,
} from './compute';
export {
  aggregateMoneyReceivedPence,
  aggregateMoneyReceivedByMethod,
  aggregateRefundOutflowsPence,
  aggregateUnverifiedLegacyPence,
  aggregateConfirmedReceiptsThroughAsOf,
  aggregateMetricPence,
  fetchDrillPage,
  iterateDrillPages,
  paymentWhereForMetric,
  methodBreakdownFromGroupBy,
  requireMoneyReceivedMethodRows,
  CLASSIFIED_PAYMENT_STATUSES,
  EXPORT_PAGE_SIZE,
} from './query';
export { qualityForMoneyReceivedBundle } from './quality';
export {
  reconcileMoneyReceivedToDetailSum,
  reconcileMethodBreakdownToMoneyReceived,
  methodLabel,
} from './reconcile';
export { buildMoneyReceivedDrillRows, paginateDrillRows, drillSumPence } from './drill-down';
export {
  computeMoneyReceivedBundle,
  computeMoneyReceivedBundleFromDb,
  computeMoneyReceivedBundleFromFacts,
  getGatedMoneyMetric,
  drillDownForMetric,
} from './service';
export {
  buildMoneyReceivedExportCsv,
  buildMoneyReceivedExportCsvFromRows,
  iterMoneyReceivedExportCsvChunks,
  spreadsheetSafeCell,
} from './export';
export { resolveMoneyReceivedAccess, assertDrillRowTenant } from './access';

/** PR #84 trading/receipts surface — CONFIRMED-only; no parent RETURNED/VOID exclusion. */
export {
  LEGACY_MONEY_RECEIVED_SUMMARY_ROW_CAP,
  SUPPORTED_RECEIPT_METHODS,
  UNKNOWN_RECEIPT_METHOD,
  RECEIPT_METHOD_BUCKETS,
  RECEIPT_METHOD_LABELS,
  SUPPORTED_RECEIPT_ORIGINS,
  RECEIPTS_PAGE_SIZE,
  RECEIPTS_MAX_PAGE_SIZE,
  isSupportedMethod,
  resolveReceiptMethodBucket,
  sumMoneyReceivedByMethod,
  getMoneyReceivedSummary,
  listMoneyReceivedPayments,
  findTenantSalesPayment,
  parseReceiptMethodParam,
  parseReceiptOriginParam,
  classifySalesPaymentReceipt,
  RECEIPT_CLASSIFICATION_LABELS,
  type ReceiptMethodBucket,
  type ReceiptPaymentMethod,
  type MoneyReceivedByMethod,
  type MoneyReceivedSummary,
  type MoneyReceivedRow,
  type ReceiptClassification,
  type ReceiptPaymentState,
} from './trading-surface';
