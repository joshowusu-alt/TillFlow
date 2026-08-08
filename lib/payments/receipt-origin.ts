/**
 * Payment receipt-origin contract (forward-only foundation).
 *
 * Persisted on SalesPayment.receiptOrigin as a string (SQLite + Postgres).
 *
 * Semantics:
 * - RECEIVED_AT_SALE — created by the authoritative original sale/checkout workflow
 *   (including each split-tender component and part-paid deposits at checkout).
 * - LATER_CREDIT_COLLECTION — created by the debtor/customer-payment collection
 *   workflow after the sale already exists.
 * - UNCLASSIFIED — durable origin is unavailable (legacy NULL, restore/import
 *   without provenance, or amendment/refund rows where the business action does
 *   not establish sale-time vs later-collection meaning).
 *
 * Historical NULL in the database is treated as UNCLASSIFIED for reads.
 * Do not infer origin from timestamps, payment method, drawer, or journals.
 */

export const RECEIPT_ORIGINS = [
  'RECEIVED_AT_SALE',
  'LATER_CREDIT_COLLECTION',
  'UNCLASSIFIED',
] as const;

export type ReceiptOrigin = (typeof RECEIPT_ORIGINS)[number];

export const RECEIPT_ORIGIN = {
  RECEIVED_AT_SALE: 'RECEIVED_AT_SALE',
  LATER_CREDIT_COLLECTION: 'LATER_CREDIT_COLLECTION',
  UNCLASSIFIED: 'UNCLASSIFIED',
} as const satisfies Record<ReceiptOrigin, ReceiptOrigin>;

export function isReceiptOrigin(value: unknown): value is ReceiptOrigin {
  return typeof value === 'string' && (RECEIPT_ORIGINS as readonly string[]).includes(value);
}

/**
 * Map a persisted column value to the reporting/read contract.
 * Legacy NULL (and empty) → UNCLASSIFIED.
 */
export function resolveReceiptOrigin(value: string | null | undefined): ReceiptOrigin {
  if (value == null || value === '') return RECEIPT_ORIGIN.UNCLASSIFIED;
  if (isReceiptOrigin(value)) return value;
  return RECEIPT_ORIGIN.UNCLASSIFIED;
}

/**
 * Validate a backup/import payload origin.
 * Missing → null (legacy unclassified).
 * Invalid non-empty → throws.
 */
export function parseOptionalReceiptOrigin(
  value: unknown,
): ReceiptOrigin | null {
  if (value == null || value === '') return null;
  if (isReceiptOrigin(value)) return value;
  throw new Error(
    `Invalid receiptOrigin "${String(value)}". Expected one of: ${RECEIPT_ORIGINS.join(', ')}.`,
  );
}

/** Build payment create data with a required origin (live write paths). */
export function withReceiptOrigin<T extends Record<string, unknown>>(
  payment: T,
  receiptOrigin: ReceiptOrigin,
): T & { receiptOrigin: ReceiptOrigin } {
  return { ...payment, receiptOrigin };
}
