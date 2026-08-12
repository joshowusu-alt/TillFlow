import {
  type GatedMoneyMetricId,
  type MoneyReceivedMetricId,
  MONEY_RECEIVED_DEFINITION_VERSION,
} from './types';

export type MetricDefinition = {
  metricId: MoneyReceivedMetricId | GatedMoneyMetricId;
  canonicalName: string;
  gated: boolean;
  dependencyId: string | null;
};

const PHASE1_DEFS: MetricDefinition[] = [
  { metricId: 'money_received', canonicalName: 'Money Received confirmed', gated: false, dependencyId: null },
  { metricId: 'money_received_cash', canonicalName: 'Money Received Cash', gated: false, dependencyId: null },
  { metricId: 'money_received_momo', canonicalName: 'Money Received MoMo', gated: false, dependencyId: null },
  { metricId: 'money_received_card', canonicalName: 'Money Received Card', gated: false, dependencyId: null },
  { metricId: 'money_received_transfer', canonicalName: 'Money Received Transfer', gated: false, dependencyId: null },
  { metricId: 'money_received_other', canonicalName: 'Money Received Other', gated: false, dependencyId: null },
  { metricId: 'unverified_legacy_receipts', canonicalName: 'Unverified Legacy Receipts', gated: false, dependencyId: null },
  { metricId: 'refund_outflows', canonicalName: 'Refund Outflows', gated: false, dependencyId: null },
  {
    metricId: 'payment_reversal_outflows',
    canonicalName: 'Payment Reversal Outflows',
    gated: true,
    dependencyId: 'DEP-PAY-3',
  },
  {
    metricId: 'paid_at_sale_value_incl_tax',
    canonicalName: 'Paid-at-Sale Value incl tax',
    gated: true,
    dependencyId: 'DEP-SALE-1',
  },
  {
    metricId: 'credit_originated_sale_value_incl_tax',
    canonicalName: 'Credit-Originated Sale Value incl tax',
    gated: true,
    dependencyId: 'DEP-SALE-1',
  },
  {
    metricId: 'receipts_credit_collections',
    canonicalName: 'Customer Credit Collections',
    gated: true,
    dependencyId: 'DEP-SALE-1',
  },
];

/** CanonicalMetricRegistry — Phase 1 Money Received definitions only. */
export function getMoneyReceivedMetricDefinition(
  metricId: string,
): MetricDefinition | null {
  return PHASE1_DEFS.find((d) => d.metricId === metricId) ?? null;
}

export function listPhase1MoneyReceivedMetricIds(): MoneyReceivedMetricId[] {
  return PHASE1_DEFS.filter((d) => !d.gated).map((d) => d.metricId as MoneyReceivedMetricId);
}

export function getMoneyReceivedDefinitionVersion(): string {
  return MONEY_RECEIVED_DEFINITION_VERSION;
}
