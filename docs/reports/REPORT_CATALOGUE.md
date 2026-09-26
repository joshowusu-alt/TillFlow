# Report catalogue contract

Status: formula and balance amendment applied (2026-09-23). Not implemented. `margin.line.v1`, `cash.expected.v1`, and `cash.variance.v1` name intended semantics. The current code is not an authoritative v1.

Evidence base: `docs/reports/PASS_A_INVENTORY.md`. Where this file names a current screen, the behaviour is the behaviour Pass A recorded. Where it names a canonical family, that family does not exist as a single function yet.

Words “basic”, “limited”, “advanced”, and “full” are not used as tier labels here. Caps are numeric or functional.

---

## A. Records vs analytics

Frozen. Business records stay on every plan for every date TillFlow still retains:

- sales and sale lines
- payments and receipts
- expenses and expense payments
- purchases and supplier payments
- customer and supplier invoices
- returns
- stock movements and adjustments
- source-record drill-down
- transaction history
- permitted source-record CSV exports

Analytics may be plan-restricted: trends, period comparisons, segmentation, saved analytical views, staff analysis, branch analysis, scheduled summaries, and management packs.

A Starter or Growth customer does not lose those underlying records because they did not upgrade.

Business records are also the control totals that say whether money and stock are honest: stock on hand, customer balances, supplier balances, overdue and missing-due-date warnings, and a gross-profit view that is allowed to say costs are incomplete. Opening any of those for any date the rows exist is a record. It stays on every plan.

Analytics interpret those records across time or segments: a 13-month margin trend, a two-period comparison, product or cashier rankings, branch comparison, a scheduled management pack, and the health score. Those may be plan-capped.

Worked examples from the current app:

- Opening customer invoices, recording a receipt, or downloading that customer’s statement (`/payments/customer-receipts`, `/customers/[id]/statement`) is a record.
- Opening supplier ageing, including the missing-due-date bucket (`/payments/supplier-aging`), is a record. A chart of how the 30/60/90 mix moved over the year is analytics.
- Money Received for a chosen day (`/reports/money-received`) is a record of confirmed receipts. Business Movement’s month-versus-month leakage narrative (`/reports/business-movement`) is analytics.
- The truthful gross-profit view, with cost-quality handling, is a record on every plan. The compiled Income Statement, Balance Sheet, and Cashflow Statement screens are not that view, and Starter does not receive them. A 13-month margin trend is analytics. Trading Report currently shows a firm gross-profit percentage without the incomplete-cost warning (Pass A §2.5). That is a data-quality defect in the GP view, not a reason to paywall the GP view or the underlying records.

---

## B. Canonical calculation families

Pass A found 18 engines. This contract keeps **13 calculation families**, plus two products that are not families.

The 13 ids below are frozen. An 11- or 12-family collapse is rejected:

- Folding `staff_activity` into `variance_signals` would hide a report that needs its own permission and its own sort rules.
- Folding `branch_performance` into `sales_activity` would let a single-store plan render branch comparison, which Pass A already does on Business Movement and which the commercial fence forbids.

No fifteenth family is added for income statement, balance sheet, indirect cashflow, or cash forecast. Those are statement or forecast **products** that must call the families below. Today they do not (`lib/reports/financials.ts`, `lib/reports/forecast.ts`).

`owner_today` is a dashboard composition. `owner_daily_summary` is the daily SMS product. `management_pack` is the Pro file and schedule product. Neither composition is a peer calculation, and `owner_daily_summary` is not `management_pack`.

### Family index

| ID | Business question | Canonical calculation (target) | Record or analytics | Current engines to absorb (Pass A §4) |
|---|---|---|---|---|
| `sales_activity` | What did we sell? | Σ `SalesInvoice.totalPence` where status is not `RETURNED` or `VOID`, `createdAt` in the business-timezone half-open window. Product, category, and hour are group-bys of the same lines. Invoice list is the drill-down. Voids and returns are counts of excluded or `SalesReturn` rows, not a second sales total | Record for any date. Trends and rankings are analytics | 1, and the sales half of 18 |
| `payment_flow` | What confirmed money arrived, by method? | Σ `SalesPayment.amountPence` where `status = CONFIRMED` and `receivedAt` is in scope. Method, origin (`RECEIVED_AT_SALE`, `LATER_CREDIT_COLLECTION`), and unconfirmed MoMo are filters. Refunds stay a separate outflow | Record for any date. Method mix trend is analytics | 2. MoMo Confirmation and Receipt transactions are filters, not new engines |
| `cash_reconciliation` | Does counted cash match expected cash for these shifts? | Closed-shift `expectedCashPence`, `actualCashPence`, and variance, plus `CashDrawerEntry` sums by type, as Cash Drawer does today. Open-shift expected cash is not a finished reconciliation while relevant data may be unsynced. An old counted-cash value is not the current comparison for an open shift | Record | 9 and 10 |
| `expense_activity` | What expenses were recorded and paid? | Expense documents and `ExpensePayment` rows. Journal expense totals used by the income statement must tie to these documents or show a reconciling difference | Record | 13 |
| `inventory_position` | What is on hand, and what is at or below its reorder point? | `InventoryBalance` quantity versus `Product.reorderPointBase`. Velocity reorder math stays an analytics layer on top of this position | On-hand and low/out flags are records. The velocity suggestion list is analytics | 16. Engine 15 is the analytics layer |
| `stock_movement` | What ledger rows changed stock? | `StockMovement` rows, including adjustment and transfer types. No second shrinkage total | Ledger is a record. A trend of adjustment value is analytics | 14 |
| `purchase_activity` | What did we buy? | `PurchaseInvoice` / lines, not `RETURNED`/`VOID` equivalents on the purchase status. Preferred-supplier **sales** are not this family | Record | Purchase exports and supplier payment workflow lists |
| `customer_receivables` | Who owes us, and what is overdue? | One helper. Eligible `SalesPayment` rows are `status = CONFIRMED` only. `FAILED`, `CANCELLED`, `VOID`, `PENDING`, `PENDING_MANUAL`, and any other status do not reduce the balance. `RETURNED` and `VOID` invoices contribute 0. No 90-day `createdAt` cutoff. Paid and Balance on the customer statement use this helper. Known-red A12 | Balances, overdue, missing due date are records. 30/60/90 mix over time is analytics | 11 |
| `supplier_payables` | Who do we owe, and what is overdue or missing a due date? | One helper. `PurchasePayment` has no status column, so there is no supplier-payment status to include or exclude. Every stored `PurchasePayment.amountPence` is the current paid sum. `RETURNED` and `VOID` purchase invoices contribute 0. A `PurchaseReturn.refundAmountPence` is not a second subtraction on an invoice already zeroed by that status. No 90-day cutoff. Known-red A12 | Balances and those warnings are records. Ageing mix over time is analytics | 12. Sales by Linked Supplier is **not** this family |
| `margin_performance` | What profit did these sales earn, and are costs complete? | See formula version below | A single-period GP figure with a data-quality state is a record. Trends, below-target rankings, and extra dimensions are analytics | 3, 4, 5, 6 |
| `variance_signals` | Which control differences need a source look? | Stored signals that each link to source rows. Allowed labels only: cash variance; stocktake difference; unusual void activity; high adjustment value; repeated discounts; unresolved shift difference | The underlying shift, void, discount, and adjustment rows are records. The ranked signal list is analytics | Risk alert rows. Not a staff ranking |
| `staff_activity` | What till activity is attached to this person, with context? | Formula and warning in `REPORT_ACCESS_AND_EXPORT_CONTRACT.md`. Never sorted by sales first | Analytics. Growth and Pro, explicit permission | Weekly Digest cashier tables, Risk Monitor cashier table, Business Movement cashier table |
| `branch_performance` | How do branches compare, and what is the consolidated total? | Same `sales_activity`, `payment_flow`, receivables, payables, and stock formulas, grouped by `storeId`, plus a consolidated total. Pro only | Analytics | Business Movement branch table |

### Frozen family set

These 13 ids are frozen. `staff_activity` stays separate from `variance_signals`. `branch_performance` stays separate from `sales_activity`. Income statement is not a family. This close-out adds no fourteenth family.

`owner_today` is a dashboard composition. `owner_daily_summary` is the daily SMS product. `management_pack` is the Pro file and schedule product. `owner_daily_summary` is not `management_pack`.

### Formula identifiers (intended semantics, not current code)

Reserved ids: `margin.line.v1`, `cash.expected.v1`, `cash.variance.v1`.

The implementations on `b6e4bc8` are not authoritative v1. An implementation earns the id only after the correction, a reconciliation to source rows, and fixture-backed tests. `effective_from` is the date that stamp is given. It is not set here.

#### `margin.line.v1`

Calculation states are only `READY` and `INCOMPLETE_COSTS`. “Hidden until costs set” is a presentation sentence for `INCOMPLETE_COSTS` when no cost source exists. It is not a third calculation state. A missing `VIEW_MARGIN` grant is a permission denial, not a cost state.

| Rule | Frozen meaning |
|---|---|
| Recognised sale | `SalesInvoice.paymentStatus` is not `RETURNED` and not `VOID` |
| Revenue basis | Per line, net of line discount and promo discount, before tax: `lineSubtotalPence - lineDiscountPence - promoDiscountPence`. `lineSubtotalPence` in the sale writer is the pre-discount line amount (`lib/services/sales.ts` `buildLinePricing`) |
| Line discounts | `lineDiscountPence` and `promoDiscountPence` reduce that line’s revenue. They are not a cost |
| Invoice discount | `SalesInvoice.discountPence` is allocated across lines in proportion to each line’s net above. Rounding is half-up to the nearest pesewa. The largest line takes any remainder so the allocated sum equals `discountPence`. If every line net is 0, nothing is allocated |
| Returns and refunds | See the partial-return rules below. Full `VOID` and full `RETURN` remove the attributable recognised revenue and cost. A partial goods return reverses only the attributable returned revenue and cost. A payment-only refund is not automatically a goods return. Do not ignore a `SalesReturn` merely because the parent invoice remains recognised. Payment refunds that are physical drawer cash stay in `cash.expected.v1` |
| Tax | `lineVatPence` and the NHIL / GETFund components are not revenue and not cost |
| Quantity | Revenue uses the stored line money fields, not `unitPrice * qty` recomputed at report time. Cost uses `qtyBase` only when the cost itself is authoritative. If `qtyBase` is 0 while `qtyInUnit` is positive, the line is `INCOMPLETE_COSTS` |
| Cost authority | Zero cost may be a legitimate authoritative cost. Missing cost and authoritative zero cost are different states. A check of `> 0` is not the authority rule. Wave A must identify the field or source evidence that proves cost authority before it treats a zero as authoritative. Average on-hand cost is an `inventory_position` figure and is not a substitute for a missing sale-line cost |
| Missing or ambiguous cost | If current data cannot distinguish missing cost from authoritative zero, the line is `INCOMPLETE_COSTS`. Do not classify every zero-cost line as missing. Do not treat every zero as authoritative. Do not publish a gross-profit total for a set that contains an incomplete line. Show the recognised sales total and the incomplete line count |
| Ready | Every in-scope line has authoritative cost, and line-level return attribution is proven for any `SalesReturn` that touches the set. Gross profit = revenue − cost, in integer pesewas. Otherwise the set is not `READY` |
| Rounding | Money results are integer minor units. Percentage display is presentation and is not the stored result |
| Currency | Integer minor units. For GHS, pesewas. No floating currency in the formula |
| Not a source | Do not read `SalesInvoice.grossMarginPence`. Do not use the Weekly Digest division of `defaultCostBasePence` by 100 |

Starter still receives this view, with the state. The view is not paywalled.

#### Partial returns, before `margin.line.v1` is implemented

Wave A must trace and record these before it changes `margin.line.v1` code:

- `SalesReturn` and any return-line model
- returned quantities
- returned revenue and refund amounts
- original sale-line linkage
- cost attributable to returned quantities
- inventory restoration or write-off
- full return, partial return, exchange, void, and payment-only refund paths

This close-out already records the following from `prisma/schema.prisma` and `lib/services/returns.ts`. It is the starting evidence, not a completed trace of every caller:

- `SalesReturn.salesInvoiceId` is unique. There is no `SalesReturnLine` model and no per-line returned quantity.
- `createSalesReturn` accepts only `type: 'RETURN' | 'VOID'`. Exchange is not a type on that function.
- `RETURN` sets the invoice to `RETURNED`. `VOID` sets it to `VOID`. Both restore every invoice line’s `qtyBase` and write `SALES_RETURN` stock movements for the full lines.
- `VOID` stores `refundAmountPence` 0. `RETURN` stores `min(requested refund, sum of payment amounts)`, with no payment-status filter on that sum.
- A second call throws `Sale already returned`. Replay cannot be a second partial return on the same invoice.
- `app/actions/backup.ts` can insert a `SalesReturn` row from a backup payload. That path was not re-traced here.

Frozen margin treatment:

- Full `VOID` or full `RETURN` removes the attributable recognised revenue and cost.
- A partial goods return reverses only the attributable returned revenue and cost.
- A payment-only refund is not automatically a goods return. Its margin treatment must follow the recorded commercial event.
- If line-level return attribution cannot be proven, the affected margin set cannot be stamped `READY`.
- Do not ignore a `SalesReturn` merely because the parent invoice remains recognised.

On the current writer, a refund below the amount paid still marks the whole invoice `RETURNED` and restores every quantity. That is not proof of a partial goods return and not proof of a payment-only refund. Until line attribution is proven, that set cannot be `READY`.

This amendment does not authorise a `SalesReturnLine` model or any other schema change. Wave A records the trace. It does not invent an exchange path or a return-line table in order to stamp the set `READY`.

Future tests, not written now, in `lib/reports/margin-returns.contract.test.ts`:

- full return removes attributable revenue and cost
- partial return reverses only the attributed quantity’s revenue and cost
- payment-only refund follows the recorded commercial event and does not reverse goods cost by itself
- exchange, if the trace finds no supported exchange path, is asserted unsupported and is not classified as a goods return
- replay does not reverse the same revenue and cost twice

#### Zero-cost authority

`SalesInvoiceLine.lineCostPence` is a non-null integer defaulting to 0. `InventoryBalance.avgCostBasePence` defaults to 0. `resolveAvgCost` in `lib/services/shared/inventory-utils.ts` keeps average cost only when it is `> 0`, otherwise it uses `Product.defaultCostBasePence`. Report GP paths use the same `> 0` test. No column found in this close-out records that a zero was an authoritative cost rather than an unfilled default.

Limitation: current stored zeros cannot be split into authoritative zero and missing cost. Ambiguous lines are `INCOMPLETE_COSTS`. A positive `lineCostPence` remains stored cost evidence. A positive `defaultCostBasePence` is used only when the line cost is proven missing, not when the line cost is an undistinguished 0. Wave A must name the field or source that would prove authority. If it cannot, it documents that limitation and does not add a new cost column in order to force zeros through as authoritative.

Future tests, not written now, in `lib/reports/margin-cost-authority.contract.test.ts`:

- authoritative positive cost is `READY`
- authoritative zero cost is `READY` with gross profit equal to revenue, and only when the cited authority evidence is present
- missing line cost with a valid authoritative default uses that default
- fully missing or ambiguous cost, including a stored 0 with no authority evidence, is `INCOMPLETE_COSTS` and publishes no gross-profit total

#### `cash.expected.v1`

One definition for a shift. Drawer, Home, Today, and close must call it. They must not keep private engines.

Expected physical cash =

- opening float (`CashDrawerEntry` type `OPEN_FLOAT`)
- plus eligible confirmed physical-cash receipts into that drawer (`CASH_SALE`, `CASH_DEBTOR_PAYMENT`) where the linked payment is confirmed and the cash was physical
- plus authorised cash additions (positive `CASH_ADJUSTMENT` that puts cash in)
- minus eligible physical-cash outflows (`PAID_OUT_SUPPLIER`, `PAID_OUT_EXPENSE`, and a negative `CASH_ADJUSTMENT` that removes cash)
- minus confirmed refunds and reversals that took cash out of the drawer (`CASH_REFUND`)

`CLOSE_RECONCILIATION` is not an expected-cash input. Card and MoMo are excluded unless a drawer entry records that physical drawer cash changed. Scope is business, store, till, and shift, each tied to the source entry.

The live result of this definition immediately before close must equal the stored shift-close expected-cash snapshot for the same source rows. That equality is not proven on `b6e4bc8`.

#### Expected-cash discovery precondition

Before Wave A changes expected-cash code, it must locate and document:

- the live expected-cash calculator
- the shift-close action or service
- every writer of stored `expectedCashPence`
- ordinary close
- owner-override close
- the retry or idempotency path
- the offline close path, if one exists
- any alternate close API or server action

The beginning of Wave A must stop as blocked if these cannot be traced. Wave A must not create a new expected-cash engine beside an unidentified existing writer.

Known at this close-out, and not a completed trace: `lib/reports/home-expected-cash.ts` sums open `Shift.expectedCashPence` and returns 0 when no shift is open. `lib/services/cash-drawer.ts` records entry types `OPEN_FLOAT`, `CASH_SALE`, `CASH_REFUND`, `CASH_DEBTOR_PAYMENT`, `PAID_OUT_SUPPLIER`, `PAID_OUT_EXPENSE`, `CLOSE_RECONCILIATION`, and `CASH_ADJUSTMENT`. The writer that stores `expectedCashPence` on close was not identified here.

#### Freshness labels

Do not show All synced unless reliable device acknowledgement proves it. Do not show Syncing N unless the server genuinely knows N. Otherwise show: Based on data received by TillFlow as of [business-local time]. Open-shift expected cash must not be presented as finally reconciled while relevant data may be unsynced. An old counted-cash value must never be presented as the current comparison for an open shift. Any future acknowledgement mechanism is separate implementation work and must not be invented in this close-out.

Unproven sync labels are not normal available chrome.

#### `cash.variance.v1`

`counted physical cash − cash.expected.v1`.

Counted physical cash is the close count for that shift. Variance must call `cash.expected.v1`. It must not recompute expected cash. Open-shift expected cash and closed-shift variance stay separate figures.

### Reporting clock

Every reporting window:

- uses `Business.timezone`
- builds the business-local start and end first
- uses a half-open interval `[start, end)`
- converts to the database timestamp only after that local interval exists

Do not use server-local midnight, browser-local midnight as the authority, a mix of `Africa/Accra` and server midnight, or an inclusive end instant that makes the next window overlap.

Wave A gate tests, Ghana first:

- the exact start instant is included
- the exact end instant is excluded
- two adjacent windows neither overlap nor leave a gap
- the server timezone differs from the business timezone
- a boundary at Ghana business-local midnight

UK DST boundary tests are required before any of the three formulas is stamped authoritative v1. They do not delay the first Ghana correction once the Ghana, offset, and half-open tests are green.

### Canonical service extraction (future, not this close-out)

A later wave may extract a shared calculation only when at least two current surfaces recompute the same quantity differently, or when one shared function is required to keep the single-source rule. Do not build a service layer for all 13 families. Do not refactor an unrelated report.

Each future extraction report must name the duplicated calculators replaced, the shared service created, the callers migrated, the reconciliation evidence, and the callers not yet migrated.

### Statement and forecast products (not families)

Frozen financial-statement boundary:

Starter retains all underlying sales, expense, payment, stock, receivable and payable records for every retained date. Starter receives the truthful GP view with cost-quality handling. Starter does not receive the compiled Income Statement, Balance Sheet or Cashflow Statement screens. Growth receives single-store financial statements. Pro receives eligible multi-store and consolidated financial statements. Supplier-debt and margin fields inside statements still require the relevant staff permission. Restricting a compiled statement must never restrict access to its underlying source records.

| Product | Calls | Plan |
|---|---|---|
| Income statement | `sales_activity` + `margin_performance` + `expense_activity` for the period | Compiled screen: Growth, one store. Pro: eligible multi-store and consolidated. Starter: no compiled screen. Margin fields inside the statement require `VIEW_MARGIN`. Source sales, expenses, and the all-plan GP view stay available |
| Balance sheet | Positions: cash, inventory, `customer_receivables`, `supplier_payables`, equity. Inventory plug must be labelled as a plug until it ties to `inventory_position` | Compiled screen: Growth, one store. Pro: eligible multi-store and consolidated. Starter: no compiled screen. Supplier-debt fields require `VIEW_SUPPLIER_DEBT`. Stock on hand and the receivable and payable records stay on every plan |
| Indirect cashflow statement | Movements in those positions. Must not be labelled as money received | Compiled screen: Growth, one store. Pro: eligible multi-store and consolidated. Starter: no compiled screen. Underlying payment and expense records stay on every plan |
| Cash forecast | Projected inflows from open receivables and trailing `payment_flow`, outflows from open payables and `expense_activity` | Pro. Inputs must use confirmed payments only. The current 14-day average does not (Pass A §3.15) |

### What is a filter, not an engine

- “Sales by payment method” is `payment_flow` filtered by method.
- “Product performance” is `sales_activity` grouped by product, or `margin_performance` grouped by product when profit is on screen.
- “Sales by linked supplier” is `sales_activity` grouped by `Product.preferredSupplierId`. It stays labelled as sales, not debt.
- MoMo Confirmation is the unconfirmed slice of `payment_flow` plus the confirm action.
- Receipt transactions are the row drill of `payment_flow`.

### Family count

Canonical calculation families: **13**.

Compositions and products outside that count: `owner_today` (dashboard), `owner_daily_summary` (daily SMS), `management_pack` (Pro file and schedule only), and the four statement/forecast products. Waves A–C do not build a saved-view system or an unimplemented management-pack experience. Contracts may reserve those entitlements. Waves A–C implement only the integrity defects explicitly authorised in `REPORT_ACCESS_AND_EXPORT_CONTRACT.md`.
