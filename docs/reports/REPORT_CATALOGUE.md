# Report catalogue contract

Status: proposal for Joshua to freeze. Not implemented.

Evidence base: `docs/reports/PASS_A_INVENTORY.md`. Where this file names a current screen, the behaviour is the behaviour Pass A recorded. Where it names a canonical family, that family does not exist as a single function yet.

Words “basic”, “limited”, “advanced”, and “full” are not used as tier labels here. Caps are numeric or functional.

---

## A. Records vs analytics

Business records are the shop’s own documents and the control totals that tell the owner whether money and stock are honest: sales invoices and lines, payments, expenses, stock on hand, stock ledger rows, purchase invoices, customer balances, supplier balances, overdue and missing-due-date warnings, returns, voids, adjustments, and a gross-profit view that is allowed to say the costs are incomplete. Opening any of those for any date the rows exist is a record. It stays on every plan.

Analytics interpret those records across time or segments: a 13-month margin trend, a two-period comparison, product or cashier rankings, branch comparison, a scheduled management pack, and the health score. Those may be plan-capped.

Worked examples from the current app:

- Opening customer invoices, recording a receipt, or downloading that customer’s statement (`/payments/customer-receipts`, `/customers/[id]/statement`) is a record.
- Opening supplier ageing, including the missing-due-date bucket (`/payments/supplier-aging`), is a record. A chart of how the 30/60/90 mix moved over the year is analytics.
- Money Received for a chosen day (`/reports/money-received`) is a record of confirmed receipts. Business Movement’s month-versus-month leakage narrative (`/reports/business-movement`) is analytics.
- The income statement’s gross-profit line is a record view when it carries the incomplete-stock warning already implemented in `lib/reports/financials.ts`. A 13-month margin trend is analytics. Trading Report currently shows a firm gross-profit percentage without that warning (Pass A §2.5). That is a data-quality defect in a record view, not a reason to paywall the view.

---

## B. Canonical calculation families

Pass A found 18 engines. This contract keeps **13 calculation families**, plus two products that are not families.

The draft said “roughly 11–12”. Thirteen is the precise count because two collapses would break a frozen rule:

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

### One gross-profit formula

`formula_id: margin.line.v1`

- Revenue for the margin = Σ `SalesInvoiceLine.lineSubtotalPence`.
- Cost = `lineCostPence` when it is `> 0`. Else `Product.defaultCostBasePence * qtyBase` when that default is `> 0`. Else the line is **unknown**.
- If any in-scope line is unknown, the state is **Incomplete costs**. The UI shows sales and the unknown line count. It does not show a firm gross-profit figure.
- If the viewer’s permission or plan hides margin, the state is **Hidden until costs set** only when no cost source exists at all; otherwise a hidden margin is a permission/plan state, not a fake zero. Starter still gets the GP view with these states (commercial rule: do not paywall the truth).
- If every in-scope line has a cost, the state is **Ready** and gross profit = revenue − cost.
- Exclude invoices with `paymentStatus` `RETURNED` or `VOID`. Do not also drop “any invoice that has a `salesReturn` row” (that extra filter exists only in `getMarginAnalysisSnapshot` today).
- Do not read `SalesInvoice.grossMarginPence` for display.
- Do not use the Weekly Digest `/100` estimator.
- `effective_from`: the date Joshua freezes this contract. Not set in code by this document.

`formula_id: cash.expected.v1`

- Expected cash for a shift is the expected figure Cash Drawer already stores (`expectedCashPence` / drawer entries).
- A period total is the sum of in-scope shifts.
- If any in-scope till has offline sales not yet synced, state is **Not final — tills syncing**. Do not present expected versus counted as the close.

`formula_id: cash.variance.v1`

- Variance = counted − expected on a closed shift, signed.
- Unresolved means the shift is closed and the variance is not marked reviewed.
- Same sync block as `cash.expected.v1`.
- `effective_from`: freeze date.

No other metric gets a version id in this contract.

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
