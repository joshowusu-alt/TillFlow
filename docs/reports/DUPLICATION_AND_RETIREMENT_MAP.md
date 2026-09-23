# Duplication and retirement map

Status: proposal for Joshua to freeze. Not implemented. No report route is deleted by this document.

Source contradictions: `docs/reports/PASS_A_INVENTORY.md` §8 and §10.

Counts at the bottom are the proposed disposition of **current surfaces and engines**, not a sprint plan.

---

## Rule

One business question keeps one engine. A second screen may filter or deep-link. It may not recompute.

A duplicate is retired only as a **calculation path**. The route can remain as a deep link until the catalogue UI is redesigned. Historical rows stay.

---

## Map

| Current surface or engine | Question it actually answers | Disposition | Canonical target | Why |
|---|---|---|---|---|
| Owner Home hero sales | Recognised sales today | **Deep-link** | `owner_today` widget 1 → `sales_activity` | Already calls `getSalesRevenueSummary`. Stop special-casing zero sales into a product count |
| Owner Home expected cash 0 | Open-shift expected cash | **Deep-link** | Widget 3 | Printing 0 with no open shift is the wrong empty state |
| Command Center posture | Today sales, GP%, receipts, 90-day AR, issue count | **Merge** into `owner_today`, then **retire** the private KPI mix | Families in the catalogue | GP% has no quality state. Receipts use Accra + server midnight. AR/AP ignore invoices older than 90 days |
| `getTodayKPIs` receipt window | Money received “today” | **Retire** this clock | `payment_flow` on `Business.timezone` | Pass A §3.3 |
| `getTodayKPIs` 90-day AR/AP | A slice of balances | **Retire** as a balance | `customer_receivables`, `supplier_payables` | Makes old debt look smaller |
| Trading Report sales and receipts | Canonical sales and money received | **Keep** as the filtered record view of those two families | `sales_activity`, `payment_flow` | These two already share the better contracts |
| Trading Report GP and net profit | Line GP with default cost 0, minus business-wide journal expenses | **Retire** the quiet GP number. **Deep-link** expenses | `margin_performance`, `expense_activity` | Branch filter does not apply to expenses. Missing cost still produces a percentage |
| Trading Report variance sample (`take: 100`) | A sample of shift variances | **Retire** the sample | `cash_reconciliation` | Cash Drawer lists every closed shift in the range, not a 100-row sample |
| Money Received | Confirmed receipts | **Keep** | `payment_flow` | Highest-confidence money engine |
| MoMo Confirmation | Unconfirmed MoMo queue plus confirm action | **Deep-link** the figures; **keep** the confirm action | `payment_flow` unconfirmed filter | Operational action, not a second total |
| Receipt transactions | Receipt rows | **Deep-link** | `payment_flow` drill | Same rows |
| Business Movement sales vs money | Period comparison | **Merge** | Comparison view over `sales_activity` and `payment_flow` | Keep the comparison idea. Delete the private product-total field (`lineTotalPence`) |
| Business Movement branch table | Branch comparison | **Hide** unless Pro | `branch_performance` | Ungated today |
| Business Movement cashier table | Staff sales change | **Hide** on Starter. **Merge** on Growth/Pro | `staff_activity` | Sorted from sales. Missing context fields |
| Business Movement stock block | Placeholder | **Retire** | none | `NOT_RELIABLE` / `stockInsightsEmitted: false` |
| Weekly Digest headline GP | Stored `grossMarginPence` | **Retire** | `margin.line.v1` | Different number from line GP |
| Weekly Digest top margin `/100` | Broken cost estimate | **Retire** | `margin_performance` by product | Pass A §2.5 |
| Weekly Digest previous week | Comparison | **Hide** on Starter. **Merge** | The one comparison view | Starter contract allows no comparison |
| Weekly Digest cashier tables | Staff sales and risk counts | **Merge** | `staff_activity` / `variance_signals` | Two partial tables |
| Weekly Digest payment split | Money received | **Deep-link** | `payment_flow` | Already calls the canonical aggregate, on the wrong timezone constant |
| Sales Analytics | Trends and top products | **Hide** on Starter. **Merge** the math | `sales_activity` and `margin_performance` group-bys inside the plan window | Server-local clock, third product ranking |
| Profit Margins page | Below-cost and below-target | **Keep** as a Growth+ view | `margin_performance` | Drop the extra `salesReturn` relation filter so it matches `margin.line.v1` |
| `GET /exports/margins` | Same snapshot with no plan check | **Hide** at the server | Same entitlement as the page | Pass A §9.1 |
| Income statement GP | Line GP plus incomplete-stock message | **Merge** onto `margin.line.v1` | `margin_performance` | Keep the warning behaviour. It is the only GP surface that has one |
| Balance sheet and indirect cashflow | GL statement | **Keep** as statement products | Positions of the families | Not new families. Label the inventory plug |
| Cashflow forecast trailing cash/MoMo | Payments without `CONFIRMED` | **Retire** that input | Trailing `payment_flow` | Pass A §3.15 |
| Cash Drawer | Expected, counted, variance | **Keep** | `cash_reconciliation` | Do not fold into Money Received |
| `/shifts/drawer` | Entry rows | **Deep-link** | `cash_reconciliation` drill | Role gate must match the report |
| Stock Movements | Ledger | **Keep** | `stock_movement` | Transfer rows stay visible as ledger facts. Transfer **comparison** is Pro |
| Weekly Digest `StockAdjustment` count | Adjustment documents | **Deep-link** | `stock_movement` type filter plus adjustment records | Different table, easy to misread as the ledger |
| Reorder suggestions | Velocity buy list | **Hide** on Starter. **Keep** as analytics on `inventory_position` | `inventory_position` | Low/out from reorder point stays on every plan |
| On-hand risk counts | Reorder-point flags | **Merge** | `inventory_position` | Same flags in Today KPIs and Trading Report |
| Sales by linked supplier | Preferred-supplier sales | **Merge** as a group-by | `sales_activity` | Not payables. Growth+ analytical group-by; the underlying sales remain a record |
| Risk Monitor | Alert rows and cashier discount table | **Split** | Alerts → `variance_signals`. Cashier table → `staff_activity` | Remove “anti-fraud” copy |
| Owner Brief | Second owner dashboard | **Merge** into `owner_today` plus Pro analytics. **Retire** yesterday cash query and the health-score stand-ins | `owner_today`, `margin.line.v1` | Yesterday cash ignores `CONFIRMED`. Health score invents a margin when there are no sales |
| Audit log | Audit rows | **Keep** | Control record, not a family | Pro, owner |
| Customer receipts screen | Collect and see balances | **Keep** as the record UI | `customer_receivables` | Reports deep-link here. One outstanding formula |
| `computeOutstandingBalance` ignoring payment status | A second AR formula | **Retire** | The receivables formula in the catalogue | Disagrees with `getSalesRevenueSummary` |
| Supplier ageing | AP buckets including missing due date | **Keep** | `supplier_payables` | UTC as-of becomes business-local as-of |
| Supplier payments screen | Pay a bill | **Keep** as workflow | Deep-link from `supplier_payables` | Not a report engine |
| Sales history `/sales` | Invoice list | **Keep** | `sales_activity` drill | |
| `/reports/sales` redirect | Nothing | **Retire** the route later | `/reports` or `sales_activity` | Already not a surface |
| Export pack dead links | 404s | **Retire** the hrefs | Live export routes only | Pass A §6 |
| `/exports/inventory` first store only | Silent partial stock | **Retire** that query shape | `inventory_position` for the entitled store scope | Wrong file, not a plan feature |
| Nav today sales for cashiers | Business-wide sales | **Deep-link** to the open shift’s sales only | `sales_activity` for that shift | Pass A §3.29. Business-wide is a permission leak |
| Daily SMS cron | Owner summary with GP | **Keep** the send. **Hide** unless Growth or Pro, including on the cron path | `management_pack` / Growth’s one daily send | Screen is Growth, cron is not |

---

## Counts

46 rows are in the map above. Each row is counted once, by the first disposition word, so the columns sum to 46.

| First disposition | Count | Rows |
|---|---:|---|
| Keep | 12 | Trading sales and receipts, Money Received, Profit Margins, balance sheet and indirect cashflow, Cash Drawer, Stock Movements, audit log, customer receipts, supplier ageing, supplier payments, sales history, daily SMS send |
| Merge | 7 | Command Center, Business Movement comparison, Weekly Digest cashier tables, income-statement GP, on-hand risk counts, sales by linked supplier, Owner Brief |
| Deep-link | 8 | Owner Home sales, Owner Home expected cash, MoMo figures, receipt list, Weekly Digest payment split, shift drawer, stock-adjustment count, cashier nav sales |
| Retire | 12 | Today-KPI receipt clock, 90-day AR/AP slice, Trading GP figure, Trading variance sample, Movement stock placeholder, stored GP, `/100` top margin, forecast unconfirmed input, payment-status-blind AR helper, `/reports/sales` redirect, dead export hrefs, first-store inventory query |
| Hide | 6 | Branch table, cashier table on Starter, Weekly Digest comparison on Starter, Analytics on Starter, `/exports/margins` without the page gate, velocity reorder on Starter |
| Split | 1 | Risk Monitor into `variance_signals` and `staff_activity` |

Some rows name a second action. Those are not added again: Command Center also retires its private KPI mix; Trading GP also deep-links expenses; Owner Brief also retires the yesterday-cash query and the health-score stand-ins; the daily SMS is kept and hidden on Starter, including the cron path. Forecast stays Pro. Transfer comparison stays Pro. Neither of those last two is a separate row.

Nothing in the retire column deletes a database table or a historical invoice.
