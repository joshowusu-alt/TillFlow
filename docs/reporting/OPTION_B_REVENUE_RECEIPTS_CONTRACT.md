/**
 * Option B reporting contract — Home revenue / money received / Cash Drawer.
 *
 * Locked product distinctions (do not invent alternate formulas):
 * - Sales revenue = Σ SalesInvoice.totalPence (exclude RETURNED/VOID), sale createdAt.
 * - Money received = Σ SalesPayment.amountPence (exclude FAILED/CANCELLED/VOID payments
 *   on non-voided invoices), payment receivedAt.
 * - Receipt origin = persisted SalesPayment.receiptOrigin (PR #85). Reads use
 *   resolveReceiptOrigin: NULL/empty → UNCLASSIFIED ("Historical — not classified").
 *   Never infer origin from timestamps, payment method, or drawer activity.
 * - Known buckets: RECEIVED_AT_SALE, LATER_CREDIT_COLLECTION.
 * - Unknown bucket: historical NULL / UNCLASSIFIED — kept visible; not discarded to
 *   force known-origin subtotals to equal total Money received.
 * - Reconciliation:
 *   total amount = Σ method groups (supported methods in fixtures)
 *   total amount = received-at-sale + later collections + unknown historical
 *   total count = origin counts
 *   Signed reversals stay in their origin bucket (also surfaced as reversalPence).
 * - Summary aggregation is complete DB SQL — never a capped in-memory findMany.
 * - Cash Drawer remains physical-cash-only (CASH_SALE / CASH_DEBTOR / etc.).
 * - Period bounds: business timezone, inclusive start / exclusive end.
 * - No PR #84 schema migration or historical origin backfill.
 */
export {};
