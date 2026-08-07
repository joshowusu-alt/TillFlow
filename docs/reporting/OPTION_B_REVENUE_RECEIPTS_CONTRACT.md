/**
 * Option B reporting contract — Home revenue / money received / Cash Drawer.
 *
 * Locked product distinctions (do not invent alternate formulas):
 * - Sales revenue = Σ SalesInvoice.totalPence (exclude RETURNED/VOID), sale createdAt.
 * - Money received = Σ SalesPayment.amountPence (exclude FAILED/CANCELLED/VOID payments
 *   on non-voided invoices), payment receivedAt.
 * - Receipt classification: RECEIVED_AT_SALE vs LATER_CREDIT_COLLECTION via
 *   SALE_RECEIPT_GRACE_MS against invoice.createdAt (see money-received.ts).
 * - Cash Drawer remains physical-cash-only (CASH_SALE / CASH_DEBTOR / etc.).
 * - Period bounds: business timezone, inclusive start / exclusive end.
 */
export {};
