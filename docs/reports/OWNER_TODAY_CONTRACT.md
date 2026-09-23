# Owner Today contract

Status: proposal for Joshua to freeze. Not implemented.

`owner_today` is one dashboard composition. It is not a calculation family and it does not replace the canonical reports. Every number on it is computed by a family in `REPORT_CATALOGUE.md` and deep-links to that family. Pass A shows this is not true today: Home, Command Center, Trading Report, and Owner Brief each load their own snapshots (`home-performance-kpis.ts`, `today-kpis.ts`, `TradingDashboardContent.tsx`, `owner-dashboard.ts`).

Owner Today is the owner’s landing surface on every plan. Command Center and Owner Brief stop being second and third dashboards once this contract is implemented. Until then they stay as Pass A recorded them.

---

## Chrome that is always visible

Sync state, one of:

- **All synced**
- **Syncing N** (N = offline sales or drawer events not yet acknowledged)
- **Last synced** plus the business-local time

If the state is not **All synced**, expected versus counted is not shown as a finished result. The widget stays visible and is labelled **Not final — tills syncing**.

Scope line: the single store name on Starter and Growth. On Pro: the selected store, or **Consolidated**. Pass A’s “Today · All branches” on a single-store home is retired with this contract.

Gross profit is not one of the seven widgets. If a later revision puts it on Today, it uses only Ready / Incomplete costs / Hidden. It never prints a quiet wrong percentage. Command Center’s current GP% (Pass A §3.3) does not meet this rule.

---

## Widgets

### 1. Sales today and transaction count

- Calculation: `sales_activity` for the business-local today window. Count of invoices in that set.
- Drill-down: `sales_activity` filtered to today.
- Empty: **No sales yet today** and a link to the till. Not a product-count substitution (Owner Home does that swap today).
- Data-quality: none on this widget. Missing costs do not change the sales total.
- Freshness: the sync line above. The figure is today’s synced sales; unsynced tickets are named in the sync line, not mixed in quietly.
- Role: owner; manager with `sales_activity`.
- Plan: all plans.

### 2. Money received by method

- Calculation: `payment_flow` for today, confirmed only, split by method. Unconfirmed MoMo is a count under the split, not inside the total.
- Drill-down: `payment_flow` today. The MoMo count drills to the unconfirmed filter.
- Empty: **No confirmed money received yet today**.
- Data-quality: if the receipt query fails, show **Receipts unavailable** and a null amount. Do not show 0 (Pass A: `queryFailed` must not become a real zero).
- Freshness: same sync line. Unsynced tenders are not in the total.
- Role: owner; manager with `payment_flow`.
- Plan: all plans.

### 3. Expected cash and open shifts

- Calculation: `cash.expected.v1` for open shifts, plus the count of open shifts. Counted cash appears only for shifts that are closed. Variance uses `cash.variance.v1`.
- Drill-down: `cash_reconciliation` for today.
- Empty: **No shift open** when the open-shift count is 0. Do not print expected cash as 0 in that case (Owner Home does today).
- Data-quality: **Not final — tills syncing** while any relevant till is unsynced. Do not show expected versus counted as the close.
- Freshness: required.
- Role: owner; manager with `cash_reconciliation`.
- Plan: all plans.

### 4. Expenses paid today

- Calculation: `expense_activity` payments with paid time inside today. Not journal accruals and not the income-statement expense total.
- Drill-down: `expense_activity` filtered to today.
- Empty: **No expenses paid today**.
- Data-quality: none beyond sync. A missing expense is an absent row, not a guessed number.
- Role: owner; manager with `expense_activity`.
- Plan: all plans.

### 5. Customer money outstanding

- Calculation: `customer_receivables` open balance, all dates, plus the overdue portion. No 90-day `createdAt` floor (that floor is in `getTodayKPIs` today).
- Drill-down: `customer_receivables`.
- Empty: **No customer balance outstanding**.
- Data-quality: if due dates are missing, show the missing-due-date count beside the total. Do not drop those invoices out of the balance.
- Role: owner; manager with `customer_receivables`.
- Plan: all plans. The 30/60/90 chart is not on this widget.

### 6. Supplier money outstanding

- Calculation: `supplier_payables` open balance, all dates, plus overdue, plus missing due date. Same rejection of the 90-day floor.
- Drill-down: `supplier_payables`.
- Empty: **No supplier balance outstanding**.
- Data-quality: missing due dates counted, not hidden.
- Role: owner; manager with the explicit supplier-debt permission.
- Plan: all plans for the balance. A manager without the permission does not see the amount; the widget is replaced by the permission state in the access contract, not by a zero.

### 7. Priority actions — maximum three

Closed list. If none apply, the region says **Nothing needs you right now**. **View all** appears only when a fourth candidate exists, and it opens the same list, not a different report.

| Id | Include when | Drill-down |
|---|---|---|
| `unresolved_cash_variance` | A closed shift has an unreviewed non-zero `cash.variance.v1`, and tills in scope are synced | `cash_reconciliation` |
| `overdue_customer_credit` | Overdue customer balance `> 0`. If several, the one with the largest overdue amount | `customer_receivables` filtered overdue |
| `overdue_supplier_invoice` | Overdue supplier balance `> 0` | `supplier_payables` filtered overdue |
| `open_shift_past_close` | A shift is still open after the store’s close window | `cash_reconciliation` |
| `low_or_out_priority_sku` | On-hand is 0 or at/below reorder point for a product flagged priority. One card, not one per SKU | `inventory_position` |
| `missing_supplier_due_date` | At least one open purchase has no due date | `supplier_payables` bucket `DUE_DATE_MISSING` |
| `incomplete_stocktake` | A stocktake is in progress or was due and not posted | Stocktake record |
| `pending_stock_transfer` | Pro, transfers enabled, and a transfer is pending | Transfer record |
| `sync_or_data_quality` | Syncing N, or `margin.line.v1` is Incomplete costs, or a receipt query failed | The failing source |

`pending_stock_transfer` is omitted entirely on Starter and Growth. It is not a locked row.

### Priority ladder

Use this order. Pass A does not contain a better measured order. Home attention today is a different, uncapped set (close shift, issue count, reorder, supplier payments) and is not a ranking.

1. Unresolved cash variance
2. Overdue customer credit, largest amount first
3. Overdue supplier invoice
4. Open shift past the close window
5. Low or out priority SKU
6. Missing supplier due date
7. Incomplete stocktake
8. Pending stock transfer (Pro, transfers on)
9. Sync or data-quality problem

Take the first three that match. Do not fill empty slots with lower items that did not match. Item 9 is included when it matches and higher slots are empty, or when it outranks nothing above it that also matches — it does not jump the queue while a variance or overdue balance is present.

---

## Role and plan for the page

| | Starter | Growth | Pro |
|---|---|---|---|
| Owner | All seven widgets, one store | Same | Store or consolidated. Transfer action allowed when enabled |
| Manager | Widgets their permissions allow | Same, still one store | Same, plus branch scope only with branch permission |
| Cashier | No Owner Today | No | No |

Cashiers keep the till. They do not get this dashboard.

---

## What Today must not do

- Recalculate sales, receipts, or cash with a private query.
- Show six reports underneath the widgets.
- Show a health score (the current score invents neutral margins and cash days; Pass A §3.22).
- Show cashier rankings.
- Show branch comparison on Starter or Growth.
- Use the words theft, fraud, suspicious employee, or anti-fraud.
