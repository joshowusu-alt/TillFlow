# Report catalogue contract

Status: frozen for Joshua review (contract close-out, 2026-09-23). Not implemented. `margin.line.v1`, `cash.expected.v1`, and `cash.variance.v1` name intended semantics. The current code is not an authoritative v1.

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
- The income statement’s gross-profit line is a record view when it carries the incomplete-stock warning already implemented in `lib/reports/financials.ts`. A 13-month margin trend is analytics. Trading Report currently shows a firm gross-profit percentage without that warning (Pass A §2.5). That is a data-quality defect in a record view, not a reason to paywall the view.

---

## B. Canonical calculation families

Pass A found 18 engines. This contract keeps **13 calculation families**, plus two products that are not families.

The 13 ids below are frozen. An 11- or 12-family collapse is rejected:

- Folding `staff_activity` into `variance_signals` would hide a report that needs its own permission and its own sort rules.
- Folding `branch_performance` into `sales_activity` would let a single-store plan render branch comparison, which Pass A already does on Business Movement and which the commercial fence forbids.

No fifteenth family is added for income statement, balance sheet, indirect cashflow, or cash forecast. Those are statement or forecast **products** that must call the families below. Today they do not (`lib/reports/financials.ts`, `lib/reports/forecast.ts`).

`owner_today` is a dashboard composition. `management_pack` is an export and schedule product. Neither is a peer calculation.

### Family index

| ID | Business question | Canonical calculation (target) | Record or analytics | Current engines to absorb (Pass A §4) |
|---|---|---|---|---|
| `sales_activity` | What did we sell? | Σ `SalesInvoice.totalPence` where status is not `RETURNED` or `VOID`, `createdAt` in the business-timezone half-open window. Product, category, and hour are group-bys of the same lines. Invoice list is the drill-down. Voids and returns are counts of excluded or `SalesReturn` rows, not a second sales total | Record for any date. Trends and rankings are analytics | 1, and the sales half of 18 |
| `payment_flow` | What confirmed money arrived, by method? | Σ `SalesPayment.amountPence` where `status = CONFIRMED` and `receivedAt` is in scope. Method, origin (`RECEIVED_AT_SALE`, `LATER_CREDIT_COLLECTION`), and unconfirmed MoMo are filters. Refunds stay a separate outflow | Record for any date. Method mix trend is analytics | 2. MoMo Confirmation and Receipt transactions are filters, not new engines |
| `cash_reconciliation` | Does counted cash match expected cash for these shifts? | Closed-shift `expectedCashPence`, `actualCashPence`, and variance, plus `CashDrawerEntry` sums by type, as Cash Drawer does today. Not final while a till in scope is unsynced | Record | 9 and 10 |
| `expense_activity` | What expenses were recorded and paid? | Expense documents and `ExpensePayment` rows. Journal expense totals used by the income statement must tie to these documents or show a reconciling difference | Record | 13 |
| `inventory_position` | What is on hand, and what is at or below its reorder point? | `InventoryBalance` quantity versus `Product.reorderPointBase`. Velocity reorder math stays an analytics layer on top of this position | On-hand and low/out flags are records. The velocity suggestion list is analytics | 16. Engine 15 is the analytics layer |
| `stock_movement` | What ledger rows changed stock? | `StockMovement` rows, including adjustment and transfer types. No second shrinkage total | Ledger is a record. A trend of adjustment value is analytics | 14 |
| `purchase_activity` | What did we buy? | `PurchaseInvoice` / lines, not `RETURNED`/`VOID` equivalents on the purchase status. Preferred-supplier **sales** are not this family | Record | Purchase exports and supplier payment workflow lists |
| `customer_receivables` | Who owes us, and what is overdue? | Open sales invoices: `max(total − Σ payments that are not FAILED, CANCELLED, or VOID, 0)`. Age from due date, else missing-due-date. No 90-day createdAt cutoff | Balances, overdue, missing due date are records. 30/60/90 mix over time is analytics | 11 |
| `supplier_payables` | Who do we owe, and what is overdue or missing a due date? | Same shape on `PurchaseInvoice`, as supplier ageing already buckets, including `DUE_DATE_MISSING` | Balances and those warnings are records. Ageing mix over time is analytics | 12. Sales by Linked Supplier is **not** this family |
| `margin_performance` | What profit did these sales earn, and are costs complete? | See formula version below | A single-period GP figure with a data-quality state is a record. Trends, below-target rankings, and extra dimensions are analytics | 3, 4, 5, 6 |
| `variance_signals` | Which control differences need a source look? | Stored signals that each link to source rows. Allowed labels only: cash variance; stocktake difference; unusual void activity; high adjustment value; repeated discounts; unresolved shift difference | The underlying shift, void, discount, and adjustment rows are records. The ranked signal list is analytics | Risk alert rows. Not a staff ranking |
| `staff_activity` | What till activity is attached to this person, with context? | Formula and warning in `REPORT_ACCESS_AND_EXPORT_CONTRACT.md`. Never sorted by sales first | Analytics. Growth and Pro, explicit permission | Weekly Digest cashier tables, Risk Monitor cashier table, Business Movement cashier table |
| `branch_performance` | How do branches compare, and what is the consolidated total? | Same `sales_activity`, `payment_flow`, receivables, payables, and stock formulas, grouped by `storeId`, plus a consolidated total. Pro only | Analytics | Business Movement branch table |

### Frozen family set

These 13 ids are frozen. `staff_activity` stays separate from `variance_signals`. `branch_performance` stays separate from `sales_activity`. Income statement is not a family. This close-out adds no fourteenth family.

`owner_today` is a dashboard composition. `management_pack` is an export and schedule product.

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
| Returns and refunds | `RETURNED` and `VOID` invoices contribute no revenue and no cost. A `SalesReturn` row does not by itself drop a line whose invoice is still recognised. Payment refunds stay in `payment_flow` and, when they are physical drawer cash, in `cash.expected.v1`. They are not negative margin revenue in v1 |
| Tax | `lineVatPence` and the NHIL / GETFund components are not revenue and not cost |
| Quantity | Revenue uses the stored line money fields, not `unitPrice * qty` recomputed at report time. Cost fallback uses `qtyBase`. If `qtyBase` is 0 while `qtyInUnit` is positive, the line is `INCOMPLETE_COSTS` |
| Cost hierarchy | 1. `lineCostPence` when `> 0`. 2. Else `Product.defaultCostBasePence * qtyBase` when that default is `> 0`. Average on-hand cost is an `inventory_position` figure and is not a substitute for a missing sale-line cost |
| Missing cost | State `INCOMPLETE_COSTS`. Do not treat the missing cost as zero. Do not publish a gross-profit total for a set that contains an incomplete line. Show the recognised sales total and the incomplete line count |
| Ready | Every in-scope line has a cost from the hierarchy. Gross profit = revenue − cost, in integer pesewas |
| Rounding | Money results are integer minor units. Percentage display is presentation and is not the stored result |
| Currency | Integer minor units. For GHS, pesewas. No floating currency in the formula |
| Not a source | Do not read `SalesInvoice.grossMarginPence`. Do not use the Weekly Digest division of `defaultCostBasePence` by 100 |

Starter still receives this view, with the state. The view is not paywalled.

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

If the server does not have a reliable acknowledgement that in-scope offline sales are in those source rows, the close is not final. Do not label it “All synced”. Do not label it “Syncing N” unless the server knows N.

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

| Product | Calls | Plan |
|---|---|---|
| Income statement | `sales_activity` + `margin_performance` + `expense_activity` for the period | Record statement on every plan, with margin state. Category detail beyond the lines above is Growth |
| Balance sheet | Positions: cash, inventory, `customer_receivables`, `supplier_payables`, equity. Inventory plug must be labelled as a plug until it ties to `inventory_position` | Growth and Pro. Starter keeps stock on hand and the two balance reports instead of this statement |
| Indirect cashflow statement | Movements in those positions. Must not be labelled as money received | Growth and Pro |
| Cash forecast | Projected inflows from open receivables and trailing `payment_flow`, outflows from open payables and `expense_activity` | Pro. Inputs must use confirmed payments only. The current 14-day average does not (Pass A §3.15) |

### What is a filter, not an engine

- “Sales by payment method” is `payment_flow` filtered by method.
- “Product performance” is `sales_activity` grouped by product, or `margin_performance` grouped by product when profit is on screen.
- “Sales by linked supplier” is `sales_activity` grouped by `Product.preferredSupplierId`. It stays labelled as sales, not debt.
- MoMo Confirmation is the unconfirmed slice of `payment_flow` plus the confirm action.
- Receipt transactions are the row drill of `payment_flow`.

### Family count

Canonical calculation families: **13**.

Compositions outside that count: `owner_today`, `management_pack`, and the four statement/forecast products.
