# Reconciliation from 1 March 2026

Owner decision: start 1 March 2026 and reconcile monthly through today (13 October 2026). October is a partial month. Each period uses the business timezone, includes its first instant and excludes the first instant of the next period.

## Evidence needed

Establish opening balances at the end of 28 February: bank and MoMo account balances, till cash, stock quantities and supported costs, customer debts, supplier debts, owner capital, drawings and other liabilities. Obtain monthly bank and MoMo statements from March onward. Record who provided each file, its account, period and opening/closing balance. Do not claim a historical physical count occurred if no count record exists.

For each month compare receipts and payments to statements, identify fees, transfers, settlement timing, duplicates and omissions, and carry explained outstanding items into the next month. Internal transfers must connect both accounts without being treated as sales or expenses twice. Cash needs shift/count evidence rather than a bank statement. Stock needs quantities, cost evidence and movements; customer and supplier balances need invoices, returns and collections/payments.

Prepare proposed corrections with source records, amounts, reason and affected accounts. Historical changes require owner review and approval. No reconciliation or historical correction has been performed by this software change.

## Software foundation in this change

The existing card/transfer page is a daily receipt-total comparison, not statement transaction matching or a full bank reconciliation. It omits outgoing payments, fees, account transfers and settlement timing. The page now states that limit.

Its totals and drill-down use CONFIRMED receipts and receivedAt, not invoice creation dates. Dates are business local dates, branches remain separate, and the exact exclusive end avoids accidentally adding a day. A saved comparison does not freeze the live receipt total: changed totals display REVIEW_REQUIRED. Statement input is validated and saving requires a branch belonging to the authenticated business.

The balance-sheet calculation preserves ledger inventory and ledger profit. Operational profit differences and the balance-sheet equation difference are exposed as reconciliation diagnostics rather than moved into inventory. Agreement alone does not verify actual balances. The existing balance sheet and cash-flow screens remain withheld.

## Completion gates

1. Confirm opening evidence and account coverage.
2. Reconcile March through September; review October through 13 October separately.
3. Review and approve any correction proposal before posting it.
4. Re-run account, subsidiary ledger and stock comparisons after approved corrections.
5. Show a balance sheet only with clear evidence/completeness status; validate cash flow against reconciled account movements.

Inventory PRs #125 and #126 remain separate dependencies and unreleased at the start of this work. This foundation introduces no schema migration and changes no Production data.

## Monthly review workspace

The next stage adds `/payments/reconciliation/balances`, available to the authenticated business's owner and manager. Open `?month=2026-03` to start the agreed March review. The normal default is the current business-local month, so the product does not impose this owner's historical start date on other businesses.

It shows every recorded account's opening balance, period debits and credits, and closing balance. Closed months use exact business-local calendar boundaries; the current month stops at the read time, excluding later-dated journals. All amounts remain signed. Month and closing trial-balance differences remain visible and are never automatically offset. A legacy opening-capital field is disclosed separately and is not silently added to the ledger.

Account details are paginated with a stable timestamp/ID order; full-period totals are not limited to a displayed page. Both account and journal business scope are enforced. Opening, movement and selected details share one serializable read transaction.

The ledger currently combines electronic money under Bank. Neither that combined balance nor a zero trial-balance difference establishes a separate verified bank or MoMo-wallet balance. The workspace displays awaiting-evidence status, has no posting or reconciliation sign-off controls, and does not import or persist statements. Individual account mapping and statement transaction matching remain the next evidence-dependent stage. Balance sheet and cash flow remain withheld.

Tests include business-local month boundaries, DST and leap months, partial-month future exclusion, negative balances, foreign-account refusal, tied-timestamp pagination, rendered evidence warnings, and PostgreSQL journal fixtures. The PostgreSQL workflow now runs these checks when the monthly review files change.
