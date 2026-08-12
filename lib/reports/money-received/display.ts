/**
 * Owner-facing display helpers for Money Received drill rows.
 * Presentation only — does not change aggregation or inclusion rules.
 */

import type { MoneyReceivedDrillRow } from './types';

export type MoneyReceivedRowKind =
  | 'money_in'
  | 'sale_amend_out'
  | 'refund_outflow'
  | 'unverified';

export function classifyMoneyReceivedRowKind(
  row: Pick<MoneyReceivedDrillRow, 'sourceType' | 'amountPence' | 'includedInMetricId'>,
): MoneyReceivedRowKind {
  if (row.sourceType === 'SalesReturnRefund' || row.includedInMetricId === 'refund_outflows') {
    return 'refund_outflow';
  }
  if (row.includedInMetricId === 'unverified_legacy_receipts') {
    return 'unverified';
  }
  if (row.amountPence < 0) {
    return 'sale_amend_out';
  }
  return 'money_in';
}

export function moneyReceivedRowKindLabel(kind: MoneyReceivedRowKind): string {
  switch (kind) {
    case 'money_in':
      return 'Money in';
    case 'sale_amend_out':
      return 'Sale amend (money out)';
    case 'refund_outflow':
      return 'Refund outflow';
    case 'unverified':
      return 'Unverified';
  }
}

export function moneyReceivedRowKindHint(kind: MoneyReceivedRowKind): string | null {
  if (kind === 'sale_amend_out') {
    return 'Sale was edited after payment — this line reduces net money received.';
  }
  if (kind === 'refund_outflow') {
    return 'Refunds are tracked separately from Money Received totals.';
  }
  return null;
}
