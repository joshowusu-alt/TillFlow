/**
 * Canonical Money Received vertical — shared types.
 * Phase 1 MetricResult contract for Payments and Money Received.
 */

export const MONEY_RECEIVED_DEFINITION_VERSION = 'tf-rc/3R.4R-phase1-money-received';

export type QualityState =
  | 'COMPLETE'
  | 'INCOMPLETE'
  | 'UNVERIFIED'
  | 'STALE_UNAVAILABLE'
  | 'UNAVAILABLE UNTIL DEPENDENCY RESOLVED'
  | 'SCOPE_MISMATCH'
  | 'QUERY_FAILED';

export type MoneyReceivedMetricId =
  | 'money_received'
  | 'money_received_cash'
  | 'money_received_momo'
  | 'money_received_card'
  | 'money_received_transfer'
  | 'money_received_other'
  | 'unverified_legacy_receipts'
  | 'refund_outflows';

export type GatedMoneyMetricId =
  | 'payment_reversal_outflows'
  | 'paid_at_sale_value_incl_tax'
  | 'credit_originated_sale_value_incl_tax'
  | 'receipts_credit_collections';

export type ReportingScopeContext = {
  businessId: string;
  branchIds: string[] | null; // null = all branches in business
  currency: string;
  timeZone: string;
  periodStart: Date; // inclusive
  periodEndExclusive: Date; // exclusive half-open
  asOf: Date;
  definitionVersion: string;
};

export type MetricResult = {
  metricId: string;
  valuePence: number | null;
  currency: string;
  businessId: string;
  branchIds: string[] | null;
  timeZone: string;
  periodStart: Date;
  periodEndExclusive: Date;
  asOf: Date;
  qualityState: QualityState;
  dependencyReason: string | null;
  sourceRevision: string;
  definitionVersion: string;
  recordCount: number;
};

export type MoneyReceivedDrillRow = {
  sourceType: 'SalesPayment' | 'SalesReturnRefund';
  sourceId: string;
  amountPence: number;
  method: string | null;
  status: string | null;
  eventAt: Date;
  salesInvoiceId: string | null;
  branchId: string | null;
  includedInMetricId: MoneyReceivedMetricId;
};

export type ReconcileResult = {
  ok: boolean;
  reason: string | null;
  headlinePence: number | null;
  detailSumPence: number | null;
};

export const KNOWN_PAYMENT_METHODS = ['CASH', 'MOBILE_MONEY', 'CARD', 'TRANSFER'] as const;

export const CONFIRMED_PAYMENT_STATUS = 'CONFIRMED';

/** Statuses that must never enter money_received. */
export const EXCLUDED_MONEY_RECEIVED_STATUSES = [
  'FAILED',
  'CANCELLED',
  'VOID',
  'PENDING',
] as const;
