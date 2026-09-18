# TillFlow Owner Walkthrough — Shared Contracts

Integration branch: `fix/tillflow-owner-walkthrough`
Preview-first. No Production deploys. No Production data writes.
No destructive migrations. No automatic financial backfill.

These contracts freeze the minimum shared rules so parallel workstreams cannot invent contradictory money, stock, or shift logic.

Authoritative TypeScript: `lib/reliability/walkthrough-contracts.ts`

## Binding formulas

### W1. Money precision
Store money as integer pence/pesewas. Round with `Math.round` at each money boundary. Never persist floats. Display via `formatMoney`.

### W2. Supplier outstanding
For one organisation/business and the active filter scope (not the current page):

```
opening supplier balance
+ credit purchases attributed to the supplier
- allocated supplier payments
- supplier credits/returns
= supplier amount outstanding
```

Pagination is not financial scope. KPI aggregation uses the full filtered population before `skip`/`take`.
Purchases with `supplierId = null` are excluded from supplier-specific totals and listed in the orphan-credit queue.

### W3. Customer outstanding
```
credit sale/invoice amount
- allocated later customer receipts
- returns/credits
= customer amount outstanding
```

Sale-time payment (`RECEIVED_AT_SALE`) is not a later credit collection (`LATER_CREDIT_COLLECTION`). Do not infer origin from timestamps.

### W4. Expense outstanding
```
expense amount
- valid allocated expense payments
- approved credits/reversals
= remaining expense balance
```

Status is derived from amounts, never the reverse:
- `UNPAID`: paid = 0
- `PART_PAID`: 0 < paid < amount
- `PAID`: paid = amount (or amount = 0)
Reject contradictory client status server-side. Overpayment is rejected unless an explicit advance workflow exists (it does not today).

### W5. Purchase outstanding
Same reducer as supplier invoices: `computeOutstandingBalance` (`max(total − allocated payments, 0)`; VOID/RETURNED = 0).

### W6. Supplier ageing buckets
As-of date is explicit. Business timezone for display; bucket math uses UTC start-of-day of the as-of and due dates.

| Bucket | Rule |
|---|---|
| `NOT_YET_DUE` | dueDate present and daysOverdue ≤ 0 |
| `D1_30` | 1–30 days overdue |
| `D31_60` | 31–60 |
| `D61_90` | 61–90 |
| `OVER_90` | > 90 |
| `DUE_DATE_MISSING` | dueDate is null |

Do not classify missing due dates as current / not yet due.
Orphan invoices (`supplierId` null) are excluded from supplier ageing and surfaced separately.

### W7. Cash drawer
A cash event affects the selected open till/shift exactly once. Non-cash methods must not change `expectedCashPence`. Destination till is explicit (`tillId`/`shiftId`), never “newest open shift for user”.

### W8. Stock movement source types
`StockMovement.type` plus `referenceType`/`referenceId` where a source exists:

`SALE`, `SALE_AMENDMENT`, `SALE_VOID`, `SALES_RETURN`, `PURCHASE`, `PURCHASE_RETURN`, `OPENING`, `ADJUSTMENT`, `ADJUSTMENT_REVERSAL`, `STOCKTAKE`, `TRANSFER_OUT`, `TRANSFER_IN`

Never invent a source. Historic null references stay null and show “No source linked”.

### W9. Stocktake item states
`UNCOUNTED` | `COUNTED` | `VARIANCE_REVIEWED` | `APPROVED` | `POSTED`

A blank/unsubmitted count is `UNCOUNTED`. Zero is valid only after deliberate confirmation (`COUNTED` with `countedBase = 0`, `countedAt`, `countedByUserId`).
Historic `IN_PROGRESS` lines with `countState` null and `countedAt` null are `UNCOUNTED` even if `countedBase` is 0.
Do not silently post or delete stale stocktakes.

### W10. Shift uniqueness
At most one `OPEN` shift per till. Existing `Shift.openKey = tillId` unique remains the DB constraint. Application must not create a second OPEN shift. Multiple OPEN shifts per user across different tills remain allowed.

### W11. Immutability and reversal
Do not rewrite historical money or stock rows to force reports to agree.
Stock adjustments: authorised Reverse posts the exact opposite movement, links via `reversalOfId`, requires reason, is idempotent, and cannot reverse a reversal.
Sales keep existing VOID/RETURN/amend paths. Do not auto-rewrite journals.

### W12. Tenant scope
Every query and mutation is scoped to `businessId` (and store/branch when the surface is store-scoped). No global unscoped repair.

### W13. Permissions
Server-side `requireBusiness` / `withBusinessContext` is the gate. Hidden UI is not enforcement.
- Cashier: POS, own shift, no supplier/expense/adjustment reverse/repair
- Manager: operational payments, stocktake, close/handover
- Owner: all of the above plus reverse adjustment, assign orphan purchases, approve variance, merge preview (if enabled)

### W14. Idempotency
Repeatable money and stock commands: durable key + payload hash. Same key + hash = replay. Same key + different hash = conflict. Concurrent requests cannot overpay or double-move cash.

### W15. Human-readable numbers
Do not replace primary keys. New documents get a tenant-unique presentation id from `BusinessSequence`:

| Kind | Prefix | Sequence name |
|---|---|---|
| Sale (existing) | `INV-` | `invoice` |
| Purchase | `PUR-` | `purchase` |
| Supplier payment | `SPAY-` | `supplier_payment` |
| Customer receipt | `RCPT-` | `customer_receipt` |
| Expense | `EXP-` | `expense` |
| Expense payment | `EPAY-` | `expense_payment` |
| Stock adjustment | `ADJ-` | `stock_adjustment` |
| Stocktake | `STK-` | `stocktake` |
| Shift closure | `SHC-` | `shift_closure` |
| Cash variance | `VAR-` | `cash_variance` |

Historic null numbers display as the prefix + last 6 of the id (e.g. `PUR-••••ab12cd`). Never backfill Production.

## Inventory loss (once)

Qualifying stock decreases post one financial effect: Dr 5100 / Cr 1200, linked to the adjustment.
Users must not post a second `Expense` on account 5100 for the same event without an explicit exceptional override + reason.
Do not rewrite historic double-posts; surface them in reconciliation.

## Credit purchases without suppliers

New credit / unpaid / part-paid purchases require a valid supplier in the same business.
Cash/paid-in-full purchases may omit a supplier (existing behaviour).
Historic orphan credit invoices stay unchanged and appear in an assignable repair queue (owner, audited, one invoice at a time).

## File ownership (exclusive)

Integrator (Agent 0) owns: `prisma/schema.prisma`, `prisma/schema.postgres.prisma`, `prisma/migrations/**`, `lib/reliability/**`, `lib/services/document-numbers.ts`, this document.

| Agent | Exclusive paths |
|---|---|
| 1 Suppliers | `lib/services/supplier-aging.ts`, `lib/services/supplier-aging.test.ts`, `lib/services/suppliers.ts`, `lib/services/suppliers-ledger.test.ts`, `lib/services/people-clarity.test.ts`, `app/(protected)/suppliers/**`, `app/(protected)/payments/supplier-aging/**`, `app/(protected)/purchases/**`, `app/actions/purchases.ts`, `app/actions/suppliers.ts`, `lib/services/purchases.ts`, `lib/services/purchases.test.ts`, `lib/link-purchase-supplier-safety.test.ts` |
| 2 Expenses / receipts | `lib/services/expenses.ts`, `lib/services/expensePayments.ts`, `lib/services/expenses-cash-drawer.test.ts`, `lib/services/expense-payments-concurrency.test.ts`, `app/actions/expenses.ts`, `app/actions/expense-payments.ts`, `app/(protected)/expenses/**`, `app/(protected)/payments/expense-payments/**`, `app/(protected)/payments/customer-receipts/**`, `lib/payments/receipt-origin.ts` (read-only unless origin labels need a helper). Customer half of `lib/services/payments.ts` only if required for receipt list filter — prefer page-level `receiptOrigin` filter. |
| 3 Inventory | `app/actions/stocktake.ts`, `app/(protected)/inventory/stocktake/**`, `lib/services/inventory-decrease.ts`, `lib/services/inventory-increase.ts`, matching inventory tests, `app/(protected)/inventory/StockAdjustmentClient.tsx`, `app/(protected)/reports/stock-movements/**` |
| 4 Shifts / cash | `lib/services/shifts.ts`, `lib/services/cash-drawer.ts`, `app/actions/shifts.ts`, `app/(protected)/shifts/**`, `components/TillManagement.tsx`, new cash-variance files under `lib/services/cash-variance*.ts` and `app/(protected)/shifts/` |
| 5 UX | `lib/navigation-config.ts`, product create/edit form pages, `app/(protected)/products/labels/**`, loading/skeleton components they already own, list-state helpers they create under `lib/ui/`, compact list CSS they create. Do **not** edit Agent 1–4 pages except via shared components in `components/` or `lib/ui/`. |
| 6 QA | Tests and review only. No feature implementation. May add tests under `lib/reliability/` and workstream `*.test.ts` if a gap is found — coordinate file names with the owner. |

`lib/services/payments.ts` (supplier payment path) stays with existing money-idempotency behaviour; Agent 1 must not rewrite it. Agent 2 must not rewrite supplier-payment functions.

Do not edit another agent's files. Propose schema changes in a comment to Agent 0; do not patch Prisma schemas.
