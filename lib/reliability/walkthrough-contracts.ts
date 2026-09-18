/**
 * Owner-walkthrough shared contracts.
 * Agents must import these helpers instead of inventing parallel bucket/status logic.
 */

export const MONEY_ROUND = (value: number): number => Math.round(value);

export type AgingBucket =
  | 'NOT_YET_DUE'
  | 'D1_30'
  | 'D31_60'
  | 'D61_90'
  | 'OVER_90'
  | 'DUE_DATE_MISSING';

export const AGING_BUCKETS: readonly AgingBucket[] = [
  'NOT_YET_DUE',
  'D1_30',
  'D31_60',
  'D61_90',
  'OVER_90',
  'DUE_DATE_MISSING',
] as const;

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  NOT_YET_DUE: 'Not yet due',
  D1_30: '1–30 days overdue',
  D31_60: '31–60 days overdue',
  D61_90: '61–90 days overdue',
  OVER_90: 'Over 90 days overdue',
  DUE_DATE_MISSING: 'Due date missing',
};

export function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Days overdue from as-of vs due date. Null due date is not a number. */
export function daysOverdue(asOf: Date, dueDate: Date): number {
  return Math.floor((utcStartOfDay(asOf).getTime() - utcStartOfDay(dueDate).getTime()) / 86_400_000);
}

export function bucketForDueDate(asOf: Date, dueDate: Date | null | undefined): AgingBucket {
  if (!dueDate) return 'DUE_DATE_MISSING';
  const overdue = daysOverdue(asOf, dueDate);
  if (overdue <= 0) return 'NOT_YET_DUE';
  if (overdue <= 30) return 'D1_30';
  if (overdue <= 60) return 'D31_60';
  if (overdue <= 90) return 'D61_90';
  return 'OVER_90';
}

export type ExpensePaymentState = 'UNPAID' | 'PART_PAID' | 'PAID';

export function expensePaymentState(amountPence: number, paidPence: number): ExpensePaymentState {
  const amount = MONEY_ROUND(amountPence);
  const paid = MONEY_ROUND(paidPence);
  if (amount === 0) return 'PAID';
  if (paid <= 0) return 'UNPAID';
  if (paid >= amount) return 'PAID';
  return 'PART_PAID';
}

export function remainingBalancePence(amountPence: number, paidPence: number): number {
  return Math.max(MONEY_ROUND(amountPence) - MONEY_ROUND(paidPence), 0);
}

export function assertExpenseStateMatchesAmounts(
  claimed: string,
  amountPence: number,
  paidPence: number,
): ExpensePaymentState {
  const derived = expensePaymentState(amountPence, paidPence);
  if (claimed && claimed !== derived) {
    throw new Error(
      `Expense payment state ${claimed} contradicts amounts (amount=${amountPence}, paid=${paidPence}). Expected ${derived}.`,
    );
  }
  return derived;
}

export function assertNoOverpayment(amountPence: number, paidPence: number): void {
  if (MONEY_ROUND(paidPence) > MONEY_ROUND(amountPence)) {
    throw new Error('Payment exceeds the remaining expense or invoice balance.');
  }
}

export const STOCKTAKE_LINE_STATES = [
  'UNCOUNTED',
  'COUNTED',
  'VARIANCE_REVIEWED',
  'APPROVED',
  'POSTED',
] as const;

export type StocktakeLineState = (typeof STOCKTAKE_LINE_STATES)[number];

export function resolveStocktakeLineState(line: {
  countState?: string | null;
  countedAt?: Date | null;
  countedBase?: number | null;
  stocktakeStatus?: string | null;
  adjusted?: boolean;
}): StocktakeLineState {
  if (line.countState && (STOCKTAKE_LINE_STATES as readonly string[]).includes(line.countState)) {
    return line.countState as StocktakeLineState;
  }
  if (line.adjusted || line.stocktakeStatus === 'COMPLETED' || line.stocktakeStatus === 'POSTED') {
    return 'POSTED';
  }
  if (line.countedAt) return 'COUNTED';
  return 'UNCOUNTED';
}

export const DOCUMENT_NUMBER_PREFIXES = {
  invoice: 'INV',
  purchase: 'PUR',
  supplier_payment: 'SPAY',
  customer_receipt: 'RCPT',
  expense: 'EXP',
  expense_payment: 'EPAY',
  stock_adjustment: 'ADJ',
  stocktake: 'STK',
  shift: 'SHF',
  shift_closure: 'SHC',
  cash_variance: 'VAR',
} as const;

export type DocumentSequenceName = keyof typeof DOCUMENT_NUMBER_PREFIXES;

export function formatDocumentNumber(sequenceName: DocumentSequenceName, nextVal: number): string {
  const prefix = DOCUMENT_NUMBER_PREFIXES[sequenceName];
  return `${prefix}-${String(nextVal).padStart(6, '0')}`;
}

export function fallbackDocumentNumber(sequenceName: DocumentSequenceName, id: string): string {
  const prefix = DOCUMENT_NUMBER_PREFIXES[sequenceName];
  const tail = id.replace(/[^a-zA-Z0-9]/g, '').slice(-6) || 'legacy';
  return `${prefix}-••••${tail}`;
}

export function displayDocumentNumber(
  sequenceName: DocumentSequenceName,
  transactionNumber: string | null | undefined,
  id: string,
): string {
  return transactionNumber?.trim() || fallbackDocumentNumber(sequenceName, id);
}

/** Assigned SHF/SHC only. Never masks or exposes a database id. */
export function displayShiftPresentationNumber(input: {
  shiftNumber?: string | null;
  closureNumber?: string | null;
  status?: string | null;
}): string {
  const closure = input.closureNumber?.trim() ?? '';
  const shift = input.shiftNumber?.trim() ?? '';
  if (input.status !== 'OPEN' && closure) return closure;
  if (shift) return shift;
  return input.status === 'OPEN' ? 'Unnumbered shift' : 'Unnumbered close';
}

export const CREDIT_PURCHASE_STATUSES = ['UNPAID', 'PART_PAID'] as const;

export function creditPurchaseRequiresSupplier(
  paymentStatus: string,
  totalPaidPence: number,
  totalPence: number,
): boolean {
  if (CREDIT_PURCHASE_STATUSES.includes(paymentStatus as (typeof CREDIT_PURCHASE_STATUSES)[number])) {
    return true;
  }
  return remainingBalancePence(totalPence, totalPaidPence) > 0;
}

export const INVENTORY_LOSS_ACCOUNT_CODE = '5100';

export const CASH_VARIANCE_STATUSES = [
  'OPEN',
  'ASSIGNED',
  'EXPLAINED',
  'RESOLVED',
  'APPROVED',
] as const;

export type CashVarianceStatus = (typeof CASH_VARIANCE_STATUSES)[number];
