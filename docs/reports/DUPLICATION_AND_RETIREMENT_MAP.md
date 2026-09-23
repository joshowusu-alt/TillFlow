# Duplication and retirement map

Status: frozen for Joshua review (contract close-out, 2026-09-23). Not implemented. No report route is deleted by this document.

Source contradictions: `docs/reports/PASS_A_INVENTORY.md` §8 and §10.

Counts at the bottom are the proposed disposition of **current surfaces and engines**, not a sprint plan.

---

## Rule

One business question keeps one engine. A second screen may filter or deep-link. It may not recompute.

A duplicate is retired only as a **calculation path**. The route can remain as a deep link until the catalogue UI is redesigned. Historical rows stay.

---

## 49-surface bridge

Pass A §1 counted 49 surfaces. The map under “Engine and symptom map” has 46 rows and is not that count. This bridge is the disposition of each of the 49. 49 rows follow.

Confidence is LOW, MEDIUM, or HIGH only from a named test, a reconciliation function, or the source query. It is not raised above Pass A.

Implementation owner and test owner are the one primary implementer, in the wave named. Independent QA is not an owner here.

Legend: M+O = `MANAGER` and `OWNER`. Export auth = `requireExportUser` (M+O). Current plan “none” means the handler does not call `getFeatures`.

| ID | Name | Path | Layer | Current engine | Family | Disposition | Replacement | Current plan | Proposed plan | Current permission | Proposed permission | Confidence | Evidence | Impl owner | Test owner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S01 | Reports hub | `app/(protected)/reports/page.tsx` `/reports` | screen | none | none | keep | Stays the index. Higher-plan cards stop opening a calculation the plan cannot run | Badge only | Records visible. Analytics cards follow the matrix | M+O | M+O. Cashier denied | HIGH | Source is a link list, no total. `reports-index-polish.test.ts` asserts badge text, not a block | Wave B | Wave B |
| S02 | Operations Today | `app/(protected)/reports/command-center/page.tsx` | screen | `getTodayKPIs` | `owner_today` | merge | Widgets call the families. No private GP or 90-day balance | none | All plans for record widgets. No branch compare | M+O | Owner; manager for families they can see | LOW | GP% has no quality state. Receipt clock is server midnight plus `Africa/Accra` (`today-kpis.ts`). No tie-out fixture | Wave A | Wave A |
| S03 | Owner Brief | `app/(protected)/reports/owner/page.tsx` | screen | `getOwnerDashboardSnapshot` | `owner_today` | merge | Same composition. Pro-only extras stay Pro | Pro `ownerIntelligence`, OWNER | Pro for the brief’s extra analytics. Today itself is all plans | OWNER | OWNER for the Pro brief | LOW | Yesterday cash omits `CONFIRMED` (`owner-dashboard.ts`). Health score has neutral stand-ins (`health-score.test.ts` tests the scorer, not source tie-out) | Wave A | Wave A |
| S04 | Weekly Digest | `app/(protected)/reports/weekly-digest/page.tsx` | screen | stored `grossMarginPence`, `/100` top margin, cashier maps | `sales_activity`, `payment_flow`, `margin_performance` | merge | Comparison view over those families. Staff block is `staff_activity` | none | Starter: no comparison and no staff. Growth: inside 13 months with grants | M+O | M+O plus `VIEW_MARGIN` and `VIEW_STAFF_ACTIVITY` where those blocks show | LOW | `weekly-digest.ts` divides default cost by 100. `weekly-digest-clarity.test.ts` does not reconcile GP | Wave A then Wave B for the gate | Wave A then Wave B |
| S05 | Risk Monitor | `app/(protected)/reports/risk-monitor/page.tsx` | screen | `RiskAlert` list plus cashier discount aggregate | `variance_signals` and `staff_activity` | split | Alerts to signals. Cashier table to staff activity | Growth `riskMonitor` | Growth signals. Staff block also needs `VIEW_STAFF_ACTIVITY` | M+O | M+O for signals. Staff grant for the cashier table | MEDIUM | Page lists stored alerts. Cashier table is a second aggregate. No fixture ties alerts to source documents | Wave B for copy. Split behaviour with Wave C grants | Wave B |
| S06 | Trading Report | `app/(protected)/reports/dashboard/page.tsx` | screen | `getSalesRevenueSummary`, `getMoneyReceivedSummary`, line GP | `sales_activity`, `payment_flow` | keep | GP display becomes `margin.line.v1`. Expenses deep-link | none | Records all plans. Trends follow the matrix | M+O | M+O. GP needs `VIEW_MARGIN` | MEDIUM | `reporting-contract.test.ts` covers the sales clock, not a ledger tie-out. Money received reconciliation is HIGH on its own screen | Wave A | Wave A |
| S07 | Money Received | `app/(protected)/reports/money-received/page.tsx` | screen | `lib/reports/money-received/*` | `payment_flow` | keep | Canonical screen | none | All plans, any stored date | M+O via `resolveMoneyReceivedAccess` | Same, plus plan window only for trends | HIGH | `money-received.test.ts` CT01, CT27; `reconcileMethodBreakdownToMoneyReceived` | Wave A only if the clock drifts. Otherwise untouched | Wave A |
| S08 | MoMo Confirmation | `app/(protected)/reports/momo-confirmation/page.tsx` | screen | confirmation queue | `payment_flow` | deep-link | Unconfirmed filter. Confirm action stays | none | All plans | M+O | M+O | HIGH | `momo-confirmation.test.ts` “classification vs Money Received” | Wave B only if a gate is added. No new family | Wave B |
| S09 | Business Movement | `app/(protected)/reports/business-movement/page.tsx` | screen | `lib/reports/business-movement/*` | comparison over `sales_activity` and `payment_flow` | merge | One comparison view. Branch table is `branch_performance`. Cashier table is `staff_activity` | none | Starter: hidden comparison. Growth: 13 months, no branch. Pro: branch with grants | M+O, branch access helper | Plan first, then `VIEW_BRANCH_COMPARISON` and `VIEW_STAFF_ACTIVITY` | MEDIUM | `business-movement.test.ts` covers change maths and encodes stock as not emitted. It does not reconcile product `lineTotalPence` to `lineSubtotalPence` | Wave A for product field and stock block. Wave B for hide | Wave A then Wave B |
| S10 | Sales Analytics | `app/(protected)/reports/analytics/page.tsx` | screen | `AnalyticsContent.tsx` line sums | `sales_activity` group-by | merge | Same group-by inside the plan window | Growth `advancedReports` | Growth 13 months. Starter does not get this comparison | M+O | M+O. Margin series needs `VIEW_MARGIN` | MEDIUM | Source query is readable. `date-parsing` / server-local window. No product-rank reconciliation fixture | Wave A | Wave A |
| S11 | Cash Drawer | `app/(protected)/reports/cash-drawer/page.tsx` | screen | shift expected/counted and `summarizeCashDrawerEntries` | `cash_reconciliation` | keep | Must call `cash.expected.v1` and `cash.variance.v1` | none | All plans, one store on Starter and Growth | M+O | M+O. Not a cashier company-wide view | LOW | `cash-drawer-clarity.test.ts` is copy. No fixture proves live expected equals stored `expectedCashPence` | Wave A | Wave A |
| S12 | Reorder Suggestions | `app/(protected)/reports/reorder-suggestions/page.tsx` | screen | velocity on the page | `inventory_position` | hide | Low/out from reorder point stays a record. This velocity list is Growth analytics | Growth `advancedReports` | Growth and Pro, 13 months / retained | M+O | M+O | MEDIUM | Formula is on the page. `reorder-suggestions-clarity.test.ts` does not tie demand to a fixture ledger | Wave B | Wave B |
| S13 | Stock Movements | `app/(protected)/reports/stock-movements/page.tsx` | screen | `StockMovement` `findMany` | `stock_movement` | keep | Ledger. No second shrinkage total | none | All plans, entitled store | M+O | M+O | HIGH | The page query lists rows and counts them. It does not derive a value. `stock-movements-clarity.test.ts` is presentation | Wave B for store scope only | Wave B |
| S14 | Sales by Linked Supplier | `app/(protected)/reports/sales-by-supplier/page.tsx` | screen | `getSupplierSalesReport` | `sales_activity` | merge | Group by `preferredSupplierId`. Not payables | Growth `advancedReports` | Growth+ analytical group-by. Underlying sales stay a record | M+O | M+O | MEDIUM | `supplier-sales.test.ts` asserts `lineTotalPence` and RETURNED/VOID exclusion. That field is not yet the frozen product rank | Wave A for the field. Gate already present | Wave A |
| S15 | Profit Margins | `app/(protected)/reports/margins/page.tsx` | screen | `getMarginAnalysisSnapshot` | `margin_performance` | keep | Drop the extra `salesReturn` exclusion so it matches `margin.line.v1` | Growth `advancedReports` | Growth+ and `VIEW_MARGIN`. Starter keeps the quality-state GP elsewhere, not this ranking | M+O | `VIEW_MARGIN` | MEDIUM | `margin-analysis.test.ts` `summarizeMarginAnalysis` has numeric fixtures. The snapshot’s date clock and return filter are not those fixtures | Wave A | Wave A |
| S16 | Income Statement | `app/(protected)/reports/income-statement/page.tsx` | screen | `getIncomeStatement` | composition of `sales_activity`, `margin_performance`, `expense_activity` | composition | Calls those families. Not a new family | Growth `financialReports` | Growth+ statement. Starter keeps the record GP view | M+O | M+O. GP lines need `VIEW_MARGIN` | MEDIUM | `financials.test.ts` covers as-of filtering, not a GP tie-out to source invoices. Incomplete-stock message exists in `financials.ts` | Wave A | Wave A |
| S17 | Cashflow | `app/(protected)/reports/cashflow/page.tsx` | screen | `getCashflow` | composition | composition | Indirect movement of positions. Not money received | Growth `financialReports` | Growth+ | M+O | M+O | MEDIUM | Same financials module. No payment-ledger reconciliation | Wave A | Wave A |
| S18 | Balance Sheet | `app/(protected)/reports/balance-sheet/page.tsx` | screen | `getBalanceSheet` | composition | composition | Positions. Inventory plug stays labelled | Growth `financialReports` | Growth+ | M+O | M+O. Supplier lines need `VIEW_SUPPLIER_DEBT` | MEDIUM | `financials.test.ts` `getBalanceSheet asOf filtering` | Wave A | Wave A |
| S19 | Cashflow Forecast | `app/(protected)/reports/cashflow-forecast/page.tsx` | screen | `getCashflowForecast` | uses `payment_flow` | keep | Pro product. Trailing payments must be confirmed | Pro `cashflowForecast`, OWNER | Pro, owner | OWNER | OWNER | LOW | `forecast.test.ts` tests `projectCashflow` arithmetic. The DB input does not filter `CONFIRMED` (`forecast.ts`) | Wave A | Wave A |
| S20 | Exports hub | `app/(protected)/reports/exports/page.tsx` | screen | none | none | keep | Links only. Risk buttons already check `riskMonitor` | none except Risk Summary buttons | Same gates as each file | M+O | M+O | HIGH | The page does not calculate. It renders links | Wave B | Wave B |
| S21 | Audit Log | `app/(protected)/reports/audit-log/page.tsx` | screen | `AuditLog` list | none | keep | Control record, not a family | Pro `auditLog`, OWNER | Pro, owner | OWNER | OWNER | HIGH | Direct list. No derived total | Wave C if grant audit rows are added. Otherwise untouched | Wave C |
| S22 | Receipt transactions | `app/(protected)/reports/receipts/page.tsx` | screen | money-received rows | `payment_flow` | deep-link | Drill of S07 | none | All plans | M+O | M+O | HIGH | Same access and classification tests as S07 | Wave A if it still sums privately. Otherwise a filter | Wave A |
| S23 | Owner Home | `components/owner-home/OwnerHomeCompletedStream.tsx` `/onboarding` | dashboard composition | `getHomePerformanceSummary`, `resolveReadinessExpectedCashPence` | `owner_today` | composition | The seven widgets. No private formulas | none on the three hero numbers | All plans, one store on Starter and Growth | Owner journey | Owner; manager sees only permitted widgets. Cashier no | MEDIUM | `home-performance-kpis.test.ts` checks field parity, not a source tie-out. Expected cash 0 with no shift is the current code | Wave A | Wave A |
| S24 | Sales history | `app/(protected)/sales/page.tsx` `/sales` | linked record screen | invoice list | `sales_activity` | keep | Source drill | none | All plans, any stored date | M+O | M+O | HIGH | List query. No second sales total on the page | Wave B for store scope | Wave B |
| S25 | What customers owe | `app/(protected)/payments/customer-receipts/page.tsx` | linked record screen | open invoices | `customer_receivables` | keep | One outstanding formula. Stop using the helper that ignores payment status | none | All plans | M+O | M+O | MEDIUM | `operational-metrics.test.ts` covers `computeOutstandingBalance`, which has no payment-status filter. That is the defect, not a pass | Wave A | Wave A |
| S26 | Supplier ageing | `app/(protected)/payments/supplier-aging/page.tsx` | linked record screen | `getSupplierAgingReport` | `supplier_payables` | keep | Business-local as-of. Includes missing due date | none | All plans for balances. 30/60/90 chart is Growth analytics | M+O | `VIEW_SUPPLIER_DEBT` | MEDIUM | Bucket set is in the page. As-of is UTC midnight, not `Business.timezone`. No named ledger fixture in this close-out | Wave A for the clock. Wave C for the grant | Wave A then Wave C |
| S27 | Supplier payments | `app/(protected)/payments/supplier-payments/page.tsx` | linked record screen | workflow list | `supplier_payables` | keep | Workflow. Totals come from S26 | none | All plans | M+O | `VIEW_SUPPLIER_DEBT` | MEDIUM | Workflow screen. Balance figure shares S26’s uncertainty | Wave C | Wave C |
| S28 | Cash drawer supporting rows | `app/(protected)/shifts/drawer/page.tsx` | linked record screen | drawer entry list | `cash_reconciliation` | deep-link | Drill of S11, scoped | none | Same as S11. Cashier only for their active shift | Any signed-in role | Server check: cashier shift, till, and store match | HIGH | The page is a list. The missing role array is the defect and is visible in the file | Wave C | Wave C |
| S29 | Sales file | `GET /exports/sales` | export | line query plus computed margin | `sales_activity` | delivery | Own-records file. Margin column only with `VIEW_MARGIN` and `READY` | none | All plans for rows. Margin column is not Starter | M+O export auth | M+O. Margin needs `VIEW_MARGIN` | LOW | Route always writes Margin. Missing cost becomes a number. No reconciliation test | Wave B. Formula call is the Wave A function | Wave B |
| S30 | Purchases file | `GET /exports/purchases` | export | purchase lines | `purchase_activity` | delivery | Own-records file | none | All plans | M+O | M+O | HIGH | Row extract in the route. Unit cost is stored, not a margin | Wave B for store scope | Wave B |
| S31 | Inventory file | `GET /exports/inventory` | export | `findFirst` store | `inventory_position` | delivery | Every entitled store. Delete the first-store inference | none | Entitled store set | M+O | M+O | LOW | Route uses `findFirst`. That is the wrong scope, not a verified on-hand total | Wave B | Wave B |
| S32 | Products file | `GET /exports/products` | export | product master | `inventory_position` | delivery | Own-records file, stored default cost | none | All plans | M+O | M+O | HIGH | Row extract. No computed margin | Wave B only if a gate is required. Rows stay all-plan | Wave B |
| S33 | Reversals file | `GET /exports/reversals` | export | returns and voids | `sales_activity` | delivery | Own-records file | none | All plans | M+O | M+O | HIGH | Row extract of return and void documents | Wave B for store scope | Wave B |
| S34 | Margins file | `GET /exports/margins` | export | `getMarginAnalysisSnapshot` | `margin_performance` | hide | Same deny as S15. Not a Starter file | none | Growth+ and `VIEW_MARGIN` | M+O | `VIEW_MARGIN` | MEDIUM | Same snapshot as S15. The route has no `getFeatures` check | Wave B | Wave B |
| S35 | Cash drawer CSV | `GET /exports/eod-csv` | export | drawer summary | `cash_reconciliation` | delivery | Same numbers as S11 | none | All plans | M+O | M+O | LOW | Same unproven expected-cash equality as S11 | Wave A | Wave A |
| S36 | Cash drawer PDF | `GET /exports/eod-pdf` | export | same as S35 | `cash_reconciliation` | delivery | Same as S35 | none | All plans | M+O | M+O | LOW | Same as S35 | Wave A | Wave A |
| S37 | Risk summary file | `GET /exports/risk-summary` | export | risk alerts | `variance_signals` | delivery | Same gate as S05. No staff ranking without the grant | Growth `riskMonitor` | Growth. Staff section needs `VIEW_STAFF_ACTIVITY` | M+O | M+O plus staff grant for cashier section | MEDIUM | Route checks `riskMonitor`. Language and cashier section are not fixture-reconciled | Wave B | Wave B |
| S38 | Money Received file | `GET /exports/money-received` | export | money-received stream | `payment_flow` | delivery | Same as S07 | none | All plans | M+O access tests | Same | HIGH | `money-received-access.test.ts` and preview validation export reconciliation | Wave B only for a future trend cap | Wave B |
| S39 | Business Movement file | `GET /exports/business-movement` | export | movement stream including branch and cashier | comparison | delivery | Omit branch and cashier unless Pro and the grants allow | none | Matches S09 | M+O access tests | Plan then grants | MEDIUM | `business-movement-export-access.test.ts` proves role and tenant, not plan | Wave B | Wave B |
| S40 | MoMo file | `GET /exports/momo-confirmation` | export | queue export | `payment_flow` | delivery | Same as S08 | none | All plans | M+O | M+O | HIGH | `momo-confirmation.test.ts` list and export | Wave B if gated. Otherwise untouched | Wave B |
| S41 | Financial statements file | `GET /api/reports/financials` | export | `financials.ts` | composition | delivery | Same families as S16–S18 | Growth `financialReports` | Growth+ and the same grants as the screens | M+O | Same as the screens | MEDIUM | Route returns 403 without `financialReports`. Figures share S16’s confidence | Wave A for figures. Gate already present | Wave A |
| S42 | Weekly Digest file | `GET /api/reports/weekly-digest` | export | same builder as S04 | same as S04 | delivery | Same gate as S04 | none | Same as S04 | M+O | Same as S04 | LOW | Same `/100` and stored GP as S04. No plan check | Wave A for math. Wave B for gate | Wave A then Wave B |
| S43 | Export pack | `GET /api/exports/pack` | export | `lib/exports/csv-writers.ts` | own-records delivery | delivery | ZIP of source ledgers. No branch or cashier pages | none | All plans, entitled stores | M+O | M+O | MEDIUM | Writers are row extracts. Sales ledger has no line margin. No row-cap test | Wave B for store scope | Wave B |
| S44 | Supplier-sales file | `GET /reports/sales-by-supplier/export` | export | `getSupplierSalesReport` | `sales_activity` | delivery | Same as S14 | Growth `advancedReports` | Growth+ | M+O | M+O | MEDIUM | Route returns 403 without the flag. Revenue field is `lineTotalPence` (`supplier-sales.test.ts`) | Wave A for the field | Wave A |
| S45 | Owner Brief file | `GET /reports/owner/export` | export | owner snapshot summary | `owner_today` | delivery | Pro summary. No private cash query | Pro `ownerIntelligence` | Pro, owner | OWNER and MANAGER are both in the route’s role list; flag still blocks non-Pro | OWNER | LOW | Summary counts. Inherits S03’s cash query | Wave A | Wave A |
| S46 | Customer statement | `GET /customers/[id]/statement` | export | invoice rows | `customer_receivables` | delivery | Own-records statement | none | All plans | M+O | M+O | HIGH | Row extract: invoice, total, paid, balance. Balance formula still needs A’s single helper | Wave A if it uses the status-blind helper | Wave A |
| S47 | Supplier statement | `GET /suppliers/[id]/statement` | export | purchase rows | `supplier_payables` | delivery | Own-records statement | none | All plans | M+O | `VIEW_SUPPLIER_DEBT` | HIGH | Row extract. Grant is the change, not the query shape | Wave C | Wave C |
| S48 | Supplier ageing file | `GET /payments/supplier-aging/export` | export | ageing buckets | `supplier_payables` | delivery | Same as S26 | none | All plans for rows. Chart is not this file | M+O | `VIEW_SUPPLIER_DEBT` | MEDIUM | Same UTC as-of as S26 | Wave A clock, Wave C grant | Wave A then Wave C |
| S49 | Daily owner summary | `GET /api/cron/eod-summary` → `enqueueOwnerDailySummarySms` | schedule | `buildOwnerDailySummarySms` | `management_pack` delivery for Growth’s one SMS | delivery | Frozen SMS formatter. Not WhatsApp | Settings check Growth. Cron does not | Growth SMS only. Starter denied on the cron path | `CRON_SECRET` plus `whatsappEnabled` | Plan check then one verified owner SMS destination | LOW | `buildOwnerDailySummarySms` always prints stored GP. Outbox `channel` is `SMS`. No segment test | Wave A for the body. Wave B for the cron plan check | Wave A then Wave B |

### Bridge checksum

49 IDs, S01 through S49, each once.

| Layer | IDs | Count |
|---|---|---:|
| screen | S01–S22 | 22 |
| dashboard composition | S23 | 1 |
| linked record screen | S24–S28 | 5 |
| export | S29–S48 | 20 |
| schedule | S49 | 1 |
| **Total** | | **49** |

| Disposition | IDs | Count |
|---|---|---:|
| keep | S01, S06, S07, S11, S13, S15, S19, S20, S21, S24, S25, S26, S27 | 13 |
| merge | S02, S03, S04, S09, S10, S14 | 6 |
| deep-link | S08, S22, S28 | 3 |
| retire | none | 0 |
| hide | S12, S34 | 2 |
| split | S05 | 1 |
| composition | S16, S17, S18, S23 | 4 |
| delivery | S29, S30, S31, S32, S33, S35, S36, S37, S38, S39, S40, S41, S42, S43, S44, S45, S46, S47, S48, S49 | 20 |
| **Total** | | **49** |

No surface in Pass A §1 is absent. `/reports/sales`, nav today sales, `GET /api/debug-financials`, dead export hrefs, and `/demo/reports` are not part of the 49. They stay known-red or notes. They are not extra bridge rows.

---

## Engine and symptom map

The rows below are not a second surface count. Several are calculation paths inside a surface already numbered above. Do not add this table to the 49.

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

## Counts for the engine map only

These 46 rows are the engine and symptom map. They are not the 49 surfaces. Surface accounting is the checksum above (49 = 49).

46 rows are in the engine map. Each row is counted once, by the first disposition word, so those columns sum to 46.

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
