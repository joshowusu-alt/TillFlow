/**
 * Intended cash.expected semantics. Not stamped authoritative v1. No effective_from.
 *
 * OPEN_FLOAT
 * + confirmed physical CASH_SALE
 * + confirmed physical CASH_DEBTOR_PAYMENT
 * + positive CASH_ADJUSTMENT
 * - PAID_OUT_SUPPLIER
 * - PAID_OUT_EXPENSE
 * - negative CASH_ADJUSTMENT
 * - confirmed physical CASH_REFUND
 *
 * CLOSE_RECONCILIATION is not an input. Card and MoMo are excluded unless a
 * drawer entry records that physical cash changed. Unconfirmed payments are
 * excluded when a payment status is present.
 */
export const EXPECTED_CASH_ENTRY_TYPES = [
  'OPEN_FLOAT',
  'CASH_SALE',
  'CASH_DEBTOR_PAYMENT',
  'CASH_ADJUSTMENT',
  'PAID_OUT_SUPPLIER',
  'PAID_OUT_EXPENSE',
  'CASH_REFUND',
] as const;

export type ExpectedCashEntryType = (typeof EXPECTED_CASH_ENTRY_TYPES)[number];

export type ExpectedCashEntry = {
  entryType: string;
  amountPence: number;
  businessId?: string | null;
  storeId?: string | null;
  tillId?: string | null;
  shiftId?: string | null;
  paymentStatus?: string | null;
};

export type ExpectedCashScope = {
  businessId?: string;
  storeId?: string;
  tillId?: string;
  shiftId?: string;
};

const ELIGIBLE = new Set<string>(EXPECTED_CASH_ENTRY_TYPES);

export function isExpectedCashEntryType(entryType: string): boolean {
  return ELIGIBLE.has(entryType);
}

export function expectedCashPenceFromEntries(
  entries: ExpectedCashEntry[],
  scope: ExpectedCashScope = {},
): number {
  let total = 0;
  for (const entry of entries) {
    if (!isExpectedCashEntryType(entry.entryType)) continue;
    if (entry.paymentStatus && entry.paymentStatus !== 'CONFIRMED') continue;
    if (scope.businessId && entry.businessId && entry.businessId !== scope.businessId) continue;
    if (scope.storeId && entry.storeId && entry.storeId !== scope.storeId) continue;
    if (scope.tillId && entry.tillId && entry.tillId !== scope.tillId) continue;
    if (scope.shiftId && entry.shiftId && entry.shiftId !== scope.shiftId) continue;
    total += entry.amountPence;
  }
  return total;
}
