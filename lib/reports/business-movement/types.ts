/**
 * Step 6B/6C — Business Movement types.
 * Stock availability readiness is NOT_RELIABLE — no historical stock claims here.
 */

export const BUSINESS_MOVEMENT_DEFINITION_VERSION = 'tf-bm/6d-insight-ranking-v1' as const;

/** Locked until snapshot/ledger readiness review (Step 6A §4.1). */
export const STOCK_AVAILABILITY_READINESS = 'NOT_RELIABLE' as const;
export type StockAvailabilityReadiness = typeof STOCK_AVAILABILITY_READINESS | 'RELIABLE';

export type BusinessMovementPeriodPair = {
  timeZone: string;
  /** Half-open [start, endExclusive) */
  currentStart: Date;
  currentEndExclusive: Date;
  comparisonStart: Date;
  comparisonEndExclusive: Date;
  /** Business-local YYYY-MM-DD labels for chrome */
  currentFromKey: string;
  currentToKey: string;
  comparisonFromKey: string;
  comparisonToKey: string;
  preset: 'last_full_calendar_month' | 'equal_length_custom';
};

export type BusinessMovementScope = {
  businessId: string;
  /** null = all authorised branches; otherwise invoice storeId filter */
  branchIds: string[] | null;
  currency: string;
  periods: BusinessMovementPeriodPair;
  asOf: Date;
  definitionVersion: typeof BUSINESS_MOVEMENT_DEFINITION_VERSION;
};

/** Guarded change maths — pct null when comparison is zero. */
export type ChangePair = {
  current: number;
  comparison: number;
  absoluteChange: number;
  /** null when comparison === 0 (avoid ±Infinity / nonsense %) */
  percentageChange: number | null;
  percentageChangeStatus: 'ok' | 'undefined_zero_comparison' | 'insufficient_data';
};

export type ContributionStatus = 'ok' | 'undefined_zero_total_delta' | 'insufficient_data';

export type EntityMovementKind = 'continuing' | 'new' | 'no_current_sales';

export type SalesHeadlineMovement = {
  salesValuePence: ChangePair;
  transactionCount: ChangePair;
  /** Average basket; null sides when tx count is 0 */
  averageTransactionValuePence: {
    current: number | null;
    comparison: number | null;
    absoluteChange: number | null;
    percentageChange: number | null;
    percentageChangeStatus: ChangePair['percentageChangeStatus'];
  };
  /** Sum of in-scope line qtyBase (product units) — reliable from SalesInvoiceLine */
  unitsSold: ChangePair;
};

export type ProductMovementRow = {
  productId: string;
  productName: string;
  kind: EntityMovementKind;
  salesValuePence: ChangePair;
  qtyBase: ChangePair;
  /** Share of product-level sales Δ; null when total product Δ is 0 */
  contributionToSalesChange: number | null;
  contributionStatus: ContributionStatus;
};

export type BranchMovementRow = {
  storeId: string;
  storeName: string;
  kind: EntityMovementKind;
  salesValuePence: ChangePair;
  transactionCount: ChangePair;
  contributionToSalesChange: number | null;
  contributionStatus: ContributionStatus;
};

export type CashierMovementRow = {
  cashierUserId: string;
  cashierName: string;
  kind: EntityMovementKind;
  salesValuePence: ChangePair;
  transactionCount: ChangePair;
  contributionToSalesChange: number | null;
  contributionStatus: ContributionStatus;
};

/**
 * Insight template slots (Fact → Evidence → Signal → Recommended check).
 * Stock-linked insights remain blocked while readiness is NOT_RELIABLE.
 */
export type BusinessMovementInsight = {
  fact: string;
  evidence: string;
  signal: string;
  recommendedCheck: string;
  strength: 'fact_only' | 'weak_signal' | 'strong_signal';
};

export type SalesComparisonResult = {
  scope: BusinessMovementScope;
  headline: SalesHeadlineMovement;
  productGrowers: ProductMovementRow[];
  productDecliners: ProductMovementRow[];
  newProducts: ProductMovementRow[];
  noCurrentSalesProducts: ProductMovementRow[];
  branches: BranchMovementRow[];
  cashiers: CashierMovementRow[];
  stockAvailabilityReadiness: typeof STOCK_AVAILABILITY_READINESS;
  /** Explicit: core sales path does not attach stock signals */
  stockInsightsEmitted: false;
};

/** Period snapshot of canonical Money Received metrics (pence). */
export type MoneyPeriodFacts = {
  moneyReceivedPence: number;
  refundOutflowsPence: number;
  /** Absolute outflow from negative CONFIRMED SalesPayment rows (still inside money_received net). */
  saleAmendMoneyOutPence: number;
  /** unverified_legacy_receipts — Needs MoMo confirmation */
  needsMomoConfirmationPence: number;
  moneyReceivedRecordCount: number;
  refundRecordCount: number;
  saleAmendRecordCount: number;
  needsMomoRecordCount: number;
  queryFailed?: boolean;
  queryError?: string | null;
};

export type MoneyMovementLayer = {
  moneyReceived: ChangePair;
  refundOutflows: ChangePair;
  saleAmendMoneyOut: ChangePair;
  needsMomoConfirmation: ChangePair;
  /** Canonical definition version echoed from Money Received scopes */
  moneyReceivedDefinitionVersion: string;
};

/**
 * Leakage / quality summary — facts only; does not redefine Money Received.
 * Gap = sales value − money received (timing/credit/pending can explain; not “error”).
 */
export type LeakageQualitySummary = {
  salesValue: ChangePair;
  moneyReceived: ChangePair;
  refundOutflows: ChangePair;
  saleAmendMoneyOut: ChangePair;
  needsMomoConfirmation: ChangePair;
  /** current sales − current money received (null if either side unavailable) */
  salesMinusMoneyReceivedCurrentPence: number | null;
  salesMinusMoneyReceivedComparisonPence: number | null;
  /** Δsales − Δmoney (null if either Δ unavailable) */
  salesVsMoneyReceivedGapChangePence: number | null;
  languageNotes: readonly string[];
};

export type BusinessMovementWithMoneyResult = SalesComparisonResult & {
  money: MoneyMovementLayer;
  leakage: LeakageQualitySummary;
  moneyQueryFailed: boolean;
  moneyQueryError: string | null;
};
