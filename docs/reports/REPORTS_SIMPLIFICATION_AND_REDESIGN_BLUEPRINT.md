# TillFlow Reports Simplification and Redesign Blueprint

Design and product definition only. Owner rulings below are final. This blueprint is ready for visual approval. It is not approval to implement the production redesign.

## 1. Baseline and worktree identity

| Check | Result |
|---|---|
| Requested SHA | `3ae520bbfea5ef294ab78fd3795afdce1ab0b74a` |
| `origin/master` | Same SHA. Merge of PR #113, Wave B-Core Stage 2. |
| Production | Vercel `dpl_4Sfui67a7cTHUDzsdG848vzYfDGG`, Ready, aliases `tillflow.app` and `www.tillflow.app`, `githubCommitSha` identical. |
| Design worktree | `C:\Users\josho\.cursor\worktrees\reports-blueprint-3ae520bb` |
| Design branch | `design/reports-simplification-blueprint` |
| Sources | `lib/entitlements/`, `docs/entitlements/WAVE_B_STAGE1_SURFACE_CATALOGUE.md`, `C:\Users\josho\OneDrive\Desktop\WAVE_B_CONTRACT.md` |

Master had not moved. Design started from that SHA.

Live Production screens were not opened. Report pages show tenant data, and Production deploy identity is not public. The audit reads the Production source.

## 2. Current-state audit

The reports hub (`app/(protected)/reports/page.tsx`) is six card groups: Daily Action, Sales & Payments, Stock & Purchases, Customers & Suppliers, Cash & Profit, Exports & Control. The sidebar (`lib/navigation-config.ts`) repeats the same destinations under Main, Sales & Stock, Finance, Control and Advanced, and adds Receipt transactions and Stock movements. A phone owner meets a catalogue, not a decision.

Shared problems, with file evidence:

- The same sale total, receipt total and cash difference appear on several pages with different windows.
- Branch is often enforced in the query and never named on the page.
- Several “today” labels are seven days, fourteen days, or all outstanding balances.
- Cash Drawer headlines sum the current page of shifts (default 20), not the period (`cash-drawer/page.tsx` lines 69–70 and 157–163). The banner still says cash expected includes all shifts (lines 261–267).
- Two MoMo queues are different systems and are described as if they were one.
- Starter attention links open Growth pages the Starter owner cannot use.
- Restricted read-only is applied by the reports layout, then drawn a second time on the three statements.

### Surface audit

**Reports hub** `/reports`. Question the page implies: where do I start? It shows a card index plus four “start here” cards. Scope: none. Plans: Owner and Manager, all plans. Mobile: a long card stack. Disposition input: it is the wrong landing page.

**Command Center** `/reports/command-center`. Nav says Command Center. Hub and H1 say Operations Today. It loads `getCommandCenterKpis`. Trustworthy pieces are today’s sales (invoice totals excluding returned and void) and today’s confirmed receipts. The rest of the attention list is not “today”:

- Discount overrides are counted for seven days (`lib/reports/today-kpis.ts` around the `sevenDaysAgo` invoice count) and labelled “discount override(s) today” (`command-center/page.tsx` around line 197).
- Cash variance is an absolute sum over seven days, with the words “recent reporting window”.
- Below-cost uses fourteen days and can miss lines whose cost is unknown.
- MoMo pending counts `mobileMoneyCollection` status `PENDING` with no date limit, and the sentence is “reconcile before end of day” (around line 176). The link goes to `/payments/reconciliation`, which is the network-collection queue.
- Supplier attention fires for every outstanding payable, not only balances past their due date.
- Customer attention is the 60-day and 90-day buckets, described as overdue receivables.
- If the KPI query fails, the page can still say there are no operational issues.
- Stock-out and reorder links go to `/reports/reorder-suggestions`, which Starter cannot open.
- Below-cost and discount links go to Growth pages.

Branch: one store, or all stores on Pro. Range-capped. Mobile: a two-column posture strip and many cards.

**Trading Report** `/reports/dashboard`. Period performance: sales, gross profit, expenses, a net-profit figure, credit sales, supplier balances, money received, voids, returns, adjustments, debtor ageing, low stock, best sellers. Default period is seven days. Stock and balances are current positions sitting next to period sales. Expenses and net profit are whole-business even when sales are one branch; the page says so in a note and still labels the card Net Profit. Not range-capped, so Starter can request a long custom range here. Mobile: duplicated headers and a dense filter.

**Money Received** `/reports/money-received`. Confirmed money by `receivedAt`, method split, refunds, and a drill table. Default seven days. This is the right question and a distinct destination. The “needs MoMo confirmation” bucket is not limited to Mobile Money. Refund helper text over-claims voids. Mobile: a wide table.

**MoMo Confirmation** `/reports/momo-confirmation`. Manual confirmation of Mobile Money payments that are not in Money Received until confirmed. Default 30 days. This is a work queue, not a dashboard. A raw status enum is shown as “Default view”. Payments in status `PENDING` (network, not manual) appear in neither this page nor Money Received.

**MoMo Reconciliation** `/payments/reconciliation`. Provider collection status: pending, failed, confirmed, re-check. Default seven days. The store control can sit on all stores. This is a different job from manual confirmation. It is in the Money nav, not the reports hub, but Command Center points at it.

**Business Movement** `/reports/business-movement`. Sales, money received, refunds, and a gap labelled as timing. Growth/Pro default is the last full calendar month against the month before, while the hub says “this month vs last”. Starter default is a 15-day window that includes the unfinished current day. Ranked insight cards repeat Trading and Money Received. Mobile: wide tables.

**Receipt transactions** `/reports/receipts`. The line list behind Money Received. Default today, while Money Received defaults to seven days. In the nav, missing from the hub. Cash Drawer links here under the words “Money received”. Mobile has cards; one mobile field labelled “When received” shows the origin classification.

**Weekly Digest** `/reports/weekly-digest`. Previous Monday–Sunday, cached for an hour. Sales, margin, voids, returns, discount counts, payment split, top sellers, cashiers. The discount headline and the per-cashier discount count use different sources and can disagree. No branch picker. Owner Brief copy calls this the last seven trading days. It is a week preset of Trading, plus a CSV.

**Sales Analytics** `/reports/analytics`. Title on the page is Trend Analytics. Growth+. Revenue includes VAT. Category totals use a pre-discount, pre-VAT base. The page says the cards match the income-statement journals; the code reads invoices, not journals. The 90-day chart can plot days out of order. Heatmap cells are transaction counts labelled as sales. Mobile: eight KPI cards and a heatmap that does not line up.

**Profit Margins** `/reports/margins`. Growth+. Per-product margin against a target. A missing authoritative cost is treated as zero, and the page total can still look precise. The useful action is “review this product’s cost”, which Trading does not do. Export link omits the branch, and the export route is still on the older role check.

**Sales by linked supplier** `/reports/sales-by-supplier`. Growth+. Sales of products with a preferred supplier. The page correctly says this is not supplier debt. “This week” is the last seven days. Unallocated ranking can drop recognised sales. Worth keeping as a drill-down.

**Reorder suggestions** `/reports/reorder-suggestions`. Growth+. Days of cover from a rolling lookback. Pending orders do not reduce the suggestion. On an all-stores scope, on-hand stock can be the first store only. “Mark ordered” is a write, and it is still offered when billing is read-only. The list is a real action page.

**Income statement** `/reports/income-statement`. Growth+. Whole business, label required. Revenue from recognised sale lines net of tax. Cost is withheld when costs are incomplete. Expenses from journals. This is a real statement. The read-only banner is duplicated.

**Balance sheet** `/reports/balance-sheet`. Growth+. Whole business, as-at date. A gap between sale-line profit and journal profit is pushed into inventory so the sheet balances (`lib/reports/financials.ts`). When costs are incomplete that plug is skipped and the sheet can silently fail to balance. That is not a customer-facing statement. Hide it from Statements until an independent correction proves `Assets = Liabilities + Equity` with no unexplained plug. Keep the route, and show withheld wording with no figures and no plug amount.

**Cash flow** `/reports/cashflow`. Hub says Cashflow, nav says Cash Flow. Indirect operating cash. Beginning cash is account 1000 plus legacy capital. Bank and MoMo balances are not in that beginning figure. “Net change in cash” is operating cash. Ending cash will not match cash plus bank. The redesigned Statements list does not promote it as reliable until a later stage corrects those labels and that formula. The route stays. Until then it states those limits and does not present a full change in the business’s cash.

**Cash drawer** `/reports/cash-drawer`. The right question: expected, counted, difference. Default seven days, filtered by when the shift opened. Headlines are the current page. Invalid legacy closes are omitted from the totals. Keep the page. Do not put its current headline on Today until a period total exists.

**Risk monitor** `/reports/risk-monitor`. Growth+. Open risk alerts, capped at 500, plus discounted sales by cashier. “Open alerts” recounts a list that is already filtered to open. There is no acknowledge action. Rename to Control alerts. The owner-facing signals that are trustworthy belong on Today; this page is the list behind them.

**Stock movements** `/reports/stock-movements`. Starter, range-capped. A ledger of stock in and out. Mobile cards exist. Keep it as a lookup, not a Today card.

**Supplier ageing** `/payments/supplier-aging`. Starter. What you owe, bucketed by due date. The as-of date moves the buckets and does not rebuild historical balances. Keep it in Payments. Today should link here only for amounts past the due date. Remove it from the reports card grid.

**What customers owe** `/payments/customer-receipts`. An operational page, already outside `/reports`, and also a hub card. Same treatment as supplier ageing.

**Supplier payments** `/payments/supplier-payments`. A write workflow. Remove it from the reports catalogue. Leave the payments route.

**Storefront analytics.** Two pages share one entitlement. `/settings/analytics` counts uppercase event names that are stored in lowercase, so the figures stay at zero. It stays out of navigation. A redirect to the working page happens only after a dependency check, in its own stage. `/settings/online-store/analytics` is the only future destination. Its undefined colour classes (`border-edge`, `text-dim`) are corrected before that page is presented as part of the polished Reports experience. The row appears only while the add-on is on.

**Audit log** `/reports/audit-log`. Pro, Owner. No date filter. Details can print `[object Object]`. Keep it under oversight. It is not a daily report.

**Exports** `/reports/exports`. A download index. The “active window” can print the exclusive end date. Risk and cash-drawer links ignore the chosen window. The sales card promises cost and margin, which Starter exports must not include. Most export routes still use the older role check rather than `guardLiveReport`. Move the hub next to statements. Entitlement repair is its own later stage, not a visual tweak.

**Owner brief** `/reports/owner`. Pro, Owner, fixed consolidated. Health score, seven cards, leakage language, a chart labelled 14-day that plots seven days, and “discount overrides used today” beside “discount overrides (7d)” for the same count. “Till variance detected yesterday” can be the latest variance in 30 days. Keep a shorter brief as the document an owner exports. Do not rebuild Today out of these cards.

**Cash flow forecast** `/reports/cashflow-forecast`. Pro, Owner. Starting cash can double-count opening capital. The inflow adds a share of receivables and also an average of cash and MoMo receipts, so collections can be counted twice. The scenario control does not change the numbers. Hide it from navigation. The direct route stays and says the estimate is withheld. It does not show forecast values.

**Legacy** `/reports/sales`. Redirects to Trading and drops query parameters. Keep the redirect. Leave it out of navigation.

**Demo** `/demo/reports`. Public marketing fixtures. The copy says 14 days; the fixture constant is 21. Align it after the live information architecture ships.

**Drawer drill-down.** Cashiers can open their own operational store. It is not a reports destination. Do not widen it.

**Sale detail.** A single receipt. Stays a record, not a report.

## 3. Duplicate-metric map

| Metric | Where it appears | What actually differs |
|---|---|---|
| Sales | Today KPIs, Owner brief, Trading, Digest, Business Movement, Analytics | Same invoice total, excluding returned and void, on different windows. Analytics product rows and category rows use other bases. |
| Money received | Today receipts, Trading card, Money Received, Business Movement, Digest, Receipts | Confirmed receipts by `receivedAt`, except the forecast and one Owner brief comparison, which are narrower. |
| Cash | Cash Drawer page totals, Owner “cash in till”, Owner “cash balance”, Forecast starting cash, seven-day absolute variance on Today | Four different balances. The drawer headline is one page of shifts. |
| Pending MoMo | Today collection count, Money Received bucket, MoMo confirmation, Business Movement, Reconciliation | Manual confirmation, unclassified payment status, and network `PENDING` collections are three populations. |
| Gross profit | Today, Owner brief, Trading, Digest, Analytics, Margins, Income statement | Today’s figure does not adjust for returns. Margins can treat a missing cost as zero. Income statement withholds profit when costs are incomplete. Analytics is VAT-inclusive. |
| Discounts | Today, Owner brief, Digest, Risk monitor | Counts of overrides, not discount value. The “today” count is seven days. |
| Debtors and payables | Today, Trading, Owner brief, Supplier ageing, Balance sheet | All-time operational balances, 60-day buckets, and journal control accounts are not the same number. |

## 4. Disposition

| Surface | Decision | Replacement | Customer benefit | Risk | Migration | Deep link | Data dependency |
|---|---|---|---|---|---|---|---|
| Reports hub | RENAME | `/reports` is Today in the first implementation stage. Activity and More replace the card catalogue. There is no second hub. | The owner lands on a decision. | Bookmarks of `/reports` change meaning. | Ship Today on `/reports` in Stage A. | Keep `/reports` as Today. | None. |
| Command Center | RENAME | Today. `/reports/command-center` redirects. | One name. | Saved links. | Redirect after Today shows the trustworthy figures. | Keep, then redirect. | Reuse sales and receipt queries. Do not reuse the mislabelled attention queries as-is. |
| Trading Report | KEEP | Activity → Trading. | Period answer stays available. | Branch sales mixed with whole-business profit. | Remove the mixed net-profit card in a query stage. | Keep `/reports/dashboard`. | Existing sales summary. |
| Money Received | KEEP | Activity → Money received. | Sales and cash-in stay distinct, which matters for MoMo. | Owners may still add them together. | Label both on Today. | Keep. | Existing confirmed-receipt query. |
| MoMo Confirmation | KEEP | Activity → MoMo to confirm. | The manual queue stays a work list. | Confused with network reconciliation. | Distinct labels. | Keep. | `PENDING_MANUAL` payments. |
| MoMo Reconciliation | KEEP | Stays in Money. Today links only to the network queue, with that name. | Re-check and retry remain. | All-store default on lower plans. | Later entitlement pass. Not this visual stage. | Keep `/payments/reconciliation`. | `mobileMoneyCollection`. |
| Business Movement | MERGE | Trading comparison for the selected period against the previous period. | One comparison, labelled with both dates. | Owners who use the insight cards. | Redirect after Trading has the comparison. | Keep `/reports/business-movement` as a redirect. | Existing comparison query, after the Starter window is honest. |
| Receipt transactions | MERGE | The line list inside Money received. | One place to see a payment. | Deep links from the drawer. | Redirect `/reports/receipts` to the filtered line list. | Keep, then redirect. | Same payment query. |
| Weekly Digest | MERGE | Trading preset `Last week (Monday–Sunday)`. Customer action: `Download last week`. CSV route and technical filename stay. | The week stops being a second sales page. | Deep links. | Redirect `/reports/weekly-digest` only after Trading shows that week. | Keep, then redirect. | Digest query becomes the preset. |
| Sales Analytics | MERGE | Growth Trading trends: sales by day, top products, busiest hour. | Removes a page whose bases disagree. | Loss of the heatmap. | Hide the nav item once Trading shows the three views. Retire the route only after that. | Keep until then. | Must stop using VAT-inclusive product margin and the unordered 90-day chart. |
| Profit Margins | RENAME | Product margins. | The cost-repair action stays. | Missing costs shown as zero. | Block the precise total until costs are complete. | Keep `/reports/margins`. | Authoritative line cost. |
| Sales by linked supplier | KEEP | Activity, Growth and Pro. | Answers a real buying question without pretending it is debt. | Incomplete supplier links. | Keep the current caveat on the page. | Keep. | Preferred supplier on the product. |
| Reorder suggestions | RENAME | Stock to reorder. | The action list stays off Today except for the few urgent rows. | “Mark ordered” on a read-only account. | Disable the write when billing is restricted. | Keep. | On-hand and recent sales. All-branch stock sum is a query fix. |
| Income statement | KEEP | Statements. | The accountant’s statement stays. | Duplicate read-only banner. | Presentation stage removes the second banner. | Keep. | Existing statement. |
| Balance sheet | HIDE UNTIL CORRECTED | No Statements row. Direct route says the statement is withheld and shows no figures and no plug amount. | Customers are not shown a sheet that balances by moving a gap into inventory. | Owners who use the page today. | Remove the nav item when the redesign ships. Return only after the integrity stage. | Keep `/reports/balance-sheet`. | Independent valuation. No plug. |
| Cash flow statement | RENAME | Withheld from the reliable Statements list until labels and the formula are corrected. Route states the current limits. | Separates it from the till and from the forecast. | Owners rely on “net change in cash”. | Do not promote it in Statements before that stage. | Keep `/reports/cashflow`. | Account 1000, bank, MoMo, and operating cash must be labelled as they are calculated. |
| Cash drawer | KEEP | Activity → Cash drawer. | “Is the till correct?” stays a destination. | Page-sized totals. | Today must not read the page total. | Keep. | A period sum of closed shifts is a new query, specified below. |
| Risk monitor | RENAME | Control alerts. | The list remains for Growth and Pro. | Starter links that 403. | Remove those links from Starter Today. | Keep `/reports/risk-monitor`. | `riskAlert` rows. |
| Stock movements | KEEP | Activity → Stock movements. | The ledger stays for disputes and adjustments. | It is a poor home-page card. | Leave it off Today. | Keep. | `stockMovement`. |
| Supplier ageing | MOVE | Payments. Today links when an amount is past the due date. | Stops a second “reports” copy of a payments page. | Hub bookmarks. | Remove the hub card. | Keep `/payments/supplier-aging`. | Operational payables. As-of history is a known limitation. |
| Customer balances | MOVE | Payments → customer receipts. | Same as suppliers. | None if the route stays. | Remove the hub card. | Keep. | Customer balances. |
| Supplier payments | HIDE | No reports entry. | A payment form is not a report. | Owners who started from the hub. | Remove the card only. | Keep the payments route. | None. |
| Storefront analytics (online store) | KEEP | Activity, only while the add-on is on. Destination `/settings/online-store/analytics`, after its style tokens render. | One real storefront page. | Broken styles if shown early. | Token fix is its own stage, before the polished row. | Keep that route. | Lowercase storefront events. |
| `/settings/analytics` | RETIRE | Absent from navigation. Redirect only after a dependency check, in a separate stage. | Removes a page that always shows zero. | Bookmarks. | Do not promote it in the redesign. | Redirect after the check. | Event names. |
| Audit log | KEEP | Oversight, Pro owner. | Control history stays. | Managers expect it. | Hidden for managers, not shown as a lock. | Keep. | `auditLog`. |
| Exports hub | MOVE | Statements → Downloads, or More → Downloads on Starter. | Downloads sit with the accountant’s work. | Export URLs. | Move the link. Do not change export files in the visual stage. | Keep `/reports/exports`. | Per-export entitlement repair is a separate stage. |
| Owner brief | KEEP | Oversight, Pro owner, always “Consolidated — all branches”. | A shareable brief remains. | It currently repeats Today. | Cut the duplicated cards down to the brief’s own narrative after Today exists. | Keep `/reports/owner`. | Existing brief query, with labels corrected. |
| Cash flow forecast | HIDE | No nav item. Direct route says the estimate is withheld and shows no forecast values, until double-counting and the scenario control are corrected. | Avoids a confident estimate that double-counts. | Owners who use it today. | Remove the nav item. Do not render the current series. | Keep `/reports/cashflow-forecast`. | Formula repair before any number returns. |
| Legacy `/reports/sales` | HIDE | Redirect to Trading. | Old links keep working. | Dropped query string. | Preserve `storeId` and dates when redirecting, in the nav stage. | Keep. | None. |
| Demo reports | LATER | Align the public demo after the live structure ships. | Marketing stops teaching the old catalogue. | Demo drift meanwhile. | Not in the first implementation PRs. | Keep `/demo/reports`. | Fixtures only. |
| Saved views | LATER | Pro. A named filter set on a report the person can already open. | Repeat visits without a report builder. | Scope and plan must be rechecked on open. | New tables. Not in the visual PRs. | New routes later. | No source today. |
| Scheduled packs | LATER | Pro owner. One weekly PDF or CSV of a saved view. | Monday morning without a new SMS project. | Delivery, consent, and billing. | After saved views. Out of Wave B-SMS. | New. | No scheduler for report packs today. |
| Drawer drill-down | KEEP | Till and shift screens. | Cashiers keep their own drawer. | Redesign might widen it. | Do not add it to reports nav. | Keep. | Shift rows. |
| Sale detail | KEEP | Opened from a payment or sale row. | One receipt. | None. | None. | Keep. | One invoice. |

Nothing in this table is a recommendation to delete a working workflow only to tidy the screen. Forecast is hidden because its number is not trustworthy, not because the idea is unwanted.

## 5. Information architecture

### Recommended: Today, Activity, and More

Three places. Today is the landing. Activity is the operating reports. More holds statements, downloads, and oversight. The plan decides which rows exist. Missing rows are absent, not locked.

**Default landing.** `/reports` is Today in the first implementation stage. Activity and More are the report navigation. They are not a second card catalogue.

**Desktop.** A reports sidebar:

- Today
- Activity
  - Trading, including `Last week (Monday–Sunday)` and `Download last week`
  - Money received
  - MoMo to confirm
  - Cash drawer
  - Stock movements
  - Product margins, Stock to reorder, Sales by linked supplier, Control alerts (Growth and Pro)
  - Storefront, only while the add-on is on, opening `/settings/online-store/analytics` after its styles are fixed
- Statements (Growth and Pro): Income statement, then Downloads. Balance sheet is absent. Cash flow statement is absent until its formula and labels are corrected.
- Oversight, Pro owner only: Owner brief, Audit log, and later saved views and scheduled packs

A Pro manager sees consolidated operating reports where the catalogue already allows consolidation. Oversight rows are absent for that manager. This ruling does not add a role entitlement beyond Stage 2.

**Mobile.** A three-item bar: Today, Activity, More. Activity is a single column of rows. More holds the income statement, downloads, and owner oversight. No horizontal scrolling.

**Where things live.**

- Today is `/reports`.
- Detailed reports live under Activity.
- The income statement lives under More, labelled `Whole business — not separated by branch`.
- Exports live under Downloads inside More.
- Pro consolidated scope lives on Today and Activity for Owner and Manager.
- Storefront analytics is one Activity row only in the valid add-on state.
- Saved views and scheduled packs, when built, are Pro owner oversight. A saved view stores report, branch scope, and date preset. A pack sends that view. There is no custom report builder.
- Forecast: no row. The direct route says the estimate is withheld and shows no values.
- Balance sheet: no row. The direct route says the statement is withheld and shows no figures.
- `/settings/analytics` has no row.
- Cashiers do not see the reports bar.

### Rejected alternative

Two destinations only: Today, and a single “All reports” list. It is weaker because the list becomes the six-section catalogue again as soon as statements, downloads, till, and stock share one screen. Three destinations keep the accountant’s statements out of the morning list without inventing Sales, Stock, Money, People, Performance, and Today.

A second rejected shape, the current six sections, fails the five-second test on a phone.

## 6. Today specification

### Header

- Title: **Today**.
- Date: `Wednesday 30 September 2026 · Local time`. The date is the business-local calendar date from the tenant timezone. The device timezone is not used. A supporting line shows the configured zone, for example `Africa/Accra`. Reusable screens do not hard-code Ghana wording.
- Scope chip, always visible: the branch name, or `Consolidated — all branches` on Pro. Accounting pages never use this chip.
- `Updated 2:14 pm` with a refresh control. If the load fails, do not show a time.
- Restricted banner: “Read-only. You can look at reports. Downloads and changes stay off until billing is sorted.”
- No plan badge and no upgrade strip on a healthy Today.

### Headline figures

Three. Each opens a short definition.

**Sales today**

- Definition: invoice totals recorded today, excluding returned and voided sales.
- Period: the business-local calendar date.
- Scope: selected branch, or all branches only on an explicit Pro consolidated view.
- Comparison: yesterday’s sales for the same scope. If yesterday was zero, say “No sales yesterday.” Do not show a percentage.
- Drill-down: Trading filtered to today.
- Empty: “No sales recorded yet today.”
- Plans: Starter, Growth, Pro.

**Money received today**

- Definition: confirmed payments whose received time is today. Credit that has not been collected is excluded. Refunds are not subtracted on this line.
- Period and scope: same as sales.
- Comparison: none on the headline. The gap between sales and money received is explained on Trading, as timing.
- Drill-down: Money received, filtered to today.
- Empty: “No confirmed payments yet today.”
- Plans: all three.

**Cash difference today**

- Definition: cash counted on tills closed today, minus cash expected, summed across those closed tills. Negative means the count was lower. Open tills are omitted because they have not been counted. The headline always shows the exact difference, including amounts under GHS 5.
- Comparison: none.
- Drill-down: Cash drawer filtered to shifts closed today.
- Empty: “No till has been closed today, so there is no cash difference to show.” Do not show GHS 0.00 for that case.
- Plans: all three.
- Prerequisite: a period query. The current Cash Drawer page total must not be reused.
- Attention: an attention row exists only when the absolute difference is at least GHS 5. A smaller difference stays on the headline and in Cash Drawer. The threshold may become configurable later. This blueprint adds no setting.

Gross profit is not a headline. On Growth and Pro it appears below, and only when every sale line today has an authoritative cost. Otherwise one sentence: “Profit is hidden because some product costs are missing.” Starter does not get a profit headline. Starter is not blocked from sales, money received, or the till.

### Attention

At most five qualifying items. Rank is fixed:

1. A till opened on a previous day is still open. Wording: “The Main till at Madina was opened yesterday and is still open.” Action: review the shift. All plans. Severity high.
2. A till closed today whose absolute cash difference is at least GHS 5. Wording: “Cash counted is GHS 35.00 less than expected.” Detail names the till, branch, and close time. Action: review the shift. All plans. Severity high. A smaller difference does not take a slot.
3. Mobile Money payments in the manual confirmation queue. Wording: “3 Mobile Money payments are waiting for you to confirm.” Detail: the amount, and “not included in money received.” Action: confirm. All plans. Severity high.
4. Network collections still pending. Wording: “2 Mobile Money collections are still pending with the network.” Action: open MoMo reconciliation. All plans. Severity medium.
5. Customer balances past their due date. Wording: “GHS 680.00 from customers is past the due date.” Detail: “Unpaid credit that is not yet due is left off this list.” Action: customer receipts. All plans. Severity medium. Do not use the 60-day bucket unless the due date is also past.
6. Supplier balances past their due date. Same pattern. Action: supplier ageing. All plans. Severity medium.
7. A product sold today for less than a recorded cost. Growth and Pro. Wording: “Gino tomato mix sold for less than its cost.” Action: Product margins. Severity medium. Starter has no row, because that destination is Growth.
8. One urgent low-stock item. Starter action is Inventory. Growth and Pro action is Stock to reorder. Severity medium.

Only the first five that qualify are shown. When two items would otherwise tie, higher severity wins, then the older unresolved item. A lower-ranked signal does not replace a higher one that failed to load. If a check fails, Today says it could not be loaded and does not say “Nothing needs attention.” If every check succeeds and none qualify: “Nothing needs attention right now.”

Every row’s destination is one that plan can open. There is no swipe-to-dismiss in the first release. Rows disappear when the underlying record changes.

Language: difference, past the due date, waiting for confirmation. Not theft, leakage, or investigate.

### Supporting insight

Below the attention list, so the first screenful on a phone is the three figures and the first attention row.

- Last 7 days: Thursday 24 September through today, each day named and valued. Horizontal bars. The heading is “Last 7 days.”
- How money came in today: Cash, Mobile Money, bank transfer, card. Amounts written out, not only a coloured bar.
- Top three products today, by sales value.
- Growth and Pro: last 30 days against the previous 30 days, in words and four weekly totals. Estimated gross profit today only when costs are complete.
- Pro consolidated: sales today by branch, each branch named.
- One line for customer balances that are not yet due, and one line for supplier balances that are not yet due, so “outstanding” and “past due” stay different.

Stock adjustments are not an attention item. A count difference posted from stocktake can be a later Growth row once that variance is a stored figure. It is not inferred from ordinary sales movements.

## 7. Plan experience

| | Starter | Growth | Pro |
|---|---|---|---|
| Navigation | Today, Activity, Downloads inside More | Adds Statements, Product margins, Stock to reorder, Sales by linked supplier, Control alerts | Adds consolidated scope, branch comparison, Owner brief, Audit log, and later saved views and packs |
| Today | Three headlines, attention, last 7 days, payment mix, top products, low stock | Adds last 30 days and profit when costs are complete. Below-cost attention. | Same, plus all-branch scope and sales by branch |
| Report depth | Trading, money, MoMo confirm, drawer, stock ledger, downloads, `Download last week` | Adds margins, reorder, supplier sales, control alerts, income statement | Adds Owner brief and Audit log for the owner. Forecast and balance sheet stay hidden |
| Dates | 30 local dates on capped analytical pages, today included | 13 calendar months on those pages | History kept. “To date” presets still end today |
| Branch | One operational branch. Multi-store must pick one. | Same. All-branches is refused in one sentence | Owner and Manager: one branch, or explicit “Consolidated — all branches” on operational reports the catalogue already allows |
| Storefront | No row | Row only while the storefront add-on is on | Row only while storefront is included. Destination is `/settings/online-store/analytics` after its styles render |
| Exports | Existing files. Cost and margin columns stay off sales exports | Cost and margin included where the catalogue already allows | Same as Growth, plus Owner brief export |
| Saved and scheduled | Absent | Absent | Later release. Not a builder |

Starter still answers: what sold, what money came in, whether a closed till matches, whether something is running out, and whether a queue or a past-due balance needs a person. The 30-date cap stays on the analytical pages named in the contract. Money Received, MoMo confirmation, receipts, and the cash drawer stay transactional, as the contract already says.

Growth does not receive a combined multi-branch operating total.

Pro consolidated views say `Consolidated — all branches`. The income statement says `Whole business — not separated by branch`. A Pro manager may open that consolidated operating view. Audit log, Owner brief, and scheduled packs stay owner-only. Stage 2 role gates are not widened.

## 8. Roles, billing, and branch state

| State | What the person sees |
|---|---|
| Owner | Full plan experience, including Pro oversight |
| Manager | Same operating reports and the income statement as the owner on that plan. On Pro, consolidated operational reports where the catalogue already permits consolidation. No Audit log, Owner brief, or scheduled pack |
| Cashier | No reports navigation and no report URL. POS, My Sales, and their own drawer remain. Direct report URLs keep the current redirect to POS |
| Active, billing open | Full view and the exports their plan allows |
| Restricted or read-only | Every report their plan allows, with the read-only banner. Downloads, sends, and “mark ordered” are off |
| Cancelled | Redirect to billing, as the contract says. No report figures. Disable-summary actions stay on the billing screen, not inside Reports |
| One branch | Scope chip is that branch. No branch picker and no all-branch control |
| Several branches, none selected | “Choose a branch.” Figures hidden. No silent sum |
| Pro, one branch | Chip is the branch name |
| Pro, all branches | Chip is `Consolidated — all branches` for an Owner or Manager, and only after an explicit choice. Omitting the choice stays on the operational branch |
| Growth or Starter asking for all branches | One explanation: “All branches is part of Pro.” A button returns to the selected branch. No card grid |
| New business | Zero sales, zero receipts, no cash difference, no invented alerts |
| Incomplete costs | Profit hidden. Below-cost attention only for lines with a recorded cost |
| Storefront off | No storefront row |
| Storefront on | One Activity row to the online-shop analytics |

Upgrade copy appears on a direct URL that the plan cannot open, and in the single all-branches explanation. It does not appear as a wall of locks on Today.

## 9. Metric and copy dictionary

| Say | Do not say | Plain definition |
|---|---|---|
| Local time, with the date | Ghana time, or a device clock | The business-local calendar date. Supporting detail shows the configured zone, such as `Africa/Accra`. |
| Last 7 days | Today, or “this week” for a rolling seven days | The seven local dates ending today. |
| Last week (Monday–Sunday) | Last 7 days, for that preset | The previous Monday through Sunday. |
| Download last week | Weekly Digest, as the button name | The file for that week. The technical filename stays. |
| Waiting for you to confirm | Before end of day | Manual MoMo payments not yet confirmed, of any age, until the queue is cleared. |
| Pending with the network | The same sentence as manual confirmation | Collections the provider has not confirmed. |
| Sales today | Money received, when the figure is invoices | Value of sales recorded in the period. |
| Money received | Sales, when the figure is confirmed payments | Confirmed payments by the time they were received. |
| Estimated gross profit | Profit, when costs are incomplete or returns are ignored | Sales value minus recorded cost, after returns, only when every line has a cost. |
| Gross profit | Profit, on the income statement’s first profit line | Statement gross profit for the whole business. |
| Profit | Net profit, on a branch page that mixes in whole-business expenses | Gross profit minus expenses plus other income, whole business, on the income statement only. |
| Cash expected | Cash in the business | What the closed till should hold from its movements. |
| Cash counted | Actual cash, without saying who counted | The amount entered when the shift was closed. |
| Cash difference | Variance, leakage, missing cash | Counted minus expected. Sign stated in words. |
| Past the due date | Overdue, when the rule is a 60-day age bucket | Due date is before today and a balance remains. |
| Outstanding, not yet due | Overdue | A balance whose due date is today or later. |
| Consolidated — all branches | All stores, or the branch name | Pro operating sum across branches, explicitly chosen. |
| Whole business — not separated by branch | Consolidated, on a statement | Accounting ledger with no store column. |
| This month | Last 30 days, when the month does not fit Starter | The first of the month through today, only when every one of those dates is inside the plan. |
| Last 30 days | This month, when Starter cannot hold the calendar month | The 30 local dates ending today. |
| Custom period, with both dates | “Period” | The from and to dates printed in full. |
| Last full month | This month vs last, when the current month is excluded | The previous calendar month against the one before it. |

Tooltips use the plain-definition column. The prototype’s “What is this?” drawer is the pattern: one definition, a close control, no article.

## 10. Mobile mockups

The review prototype renders these on a 390-point phone frame. Sample shop: Ama’s Provisions. Branches: Madina, Kaneshie, Kejetia. Currency: GHS. The header reads `Wednesday 30 September 2026 · Local time`, with `Africa/Accra` under it.

1. Starter Today, healthy day, cash difference GHS 2.00 on the headline and no attention row.
2. Starter Today, five ranked attention items. Low stock is not one of them while higher checks qualify. A separate control says Open inventory.
3. Three branches, no branch selected.
4. Growth Today, with last 30 days.
5. Pro Today, consolidated, including a Pro manager.
6. Activity list, with `Download last week`, and storefront only when the add-on control is on.
7. Money received detail, as cards.
8. Restricted billing, downloads disabled.
9. New business, zeros and no invented warnings.

Also in the same frame: cashier refusal, cancelled account, all-branches refusal, loading, load failure, and owner-only oversight.

## 11. Desktop mockups

A 1,180-point frame with the sidebar:

1. Starter Today.
2. Growth Today.
3. Pro consolidated Today, with sales by branch.
4. Activity list.
5. Money received, with a table and date chips.
6. Income statement, whole-business label. Balance sheet and cash-flow forecast are absent. Cash flow statement is not promoted as reliable.
7. Saved views and owner oversight, marked as a later Pro owner release. A manager does not see that block.

## 12. Prototype

Route: `/reviews/reports-redesign-blueprint`.

- Synthetic data only, in `BlueprintReview.tsx`.
- No Prisma, no `lib/reports`, no entitlement decision call.
- No writes.
- Not added to navigation.
- Existing report components were not edited.
- The page and middleware return 404 when `VERCEL_ENV` is production.
- Preview and local development can open it without a session.
- A banner states that it is a design prototype.

Preview URL is recorded with the commit once the branch deployment is Ready and its SHA matches.

## 13. Accessibility and low bandwidth

- Body text is 14px or larger. Amounts use the display face at a size that wraps instead of shrinking.
- Secondary text is `#4B5563` on white. The read-only banner is `#78350F` on `#FFFBEB`. The primary button is white on `#1E40AF`.
- Controls are at least 44px tall.
- The week chart prints every amount. Colour is not the only carrier. The payment mix lists Cash, Mobile Money, and transfer in words.
- Attention rows are buttons with a visible action.
- The definition drawer has a name and a close button.
- Loading uses text plus neutral blocks. Failure uses an alert and no substitute numbers.
- No chart library, no photographs, no webfont beyond the app’s existing faces. The first view is a short column. Tables become cards on the phone. A later implementation should keep Today to one request and avoid a second banner.

## 14. Quality assessment

Scored against the amended prototype and this specification. The phone and desktop frames were checked in a browser after the Owner rulings.

| Area | Score | Why |
|---|---|---|
| Clarity within five seconds | 9.2 | Three named figures, the date, and the branch are the first content. |
| Mobile usability | 9.0 | One column, 44px controls, no sideways table on Today or money received. |
| Decision usefulness | 9.0 | Attention is capped, ordered, and each row has a verb. Empty days stay quiet. |
| Information density | 9.0 | The week and the top products are present without a second grid of KPIs. |
| Visual hierarchy | 9.1 | Amounts dominate. Attention is next. The week is below. |
| Trustworthiness | 9.0 | Labels match the windows. The cash headline is specified as its own query. Forecast values and the balance sheet stay off the page until those formulas are corrected. |
| Plan differentiation | 9.0 | Starter is usable. Growth adds depth. Pro adds branches and oversight. Locks are not the interface. |
| Ghanaian retail relevance | 9.2 | Cedis, MoMo, confirmation, and branch names a shop actually uses. |
| Ease of implementation | 8.7 | Today can ship on existing sales and receipt queries. Cash difference, past-due balances, and the two MoMo queues are separate small query stages. |
| Scale to several branches | 9.0 | The chip, the explicit consolidated choice, and the branch list are specified. |
| Overall | 9.0 | |

Ease of implementation is the lowest score and is still above 8.5 because the roadmap refuses a single redesign PR. The cash headline does not ship until its query exists, so the first PR cannot pretend the drawer page total is today’s difference.

## 15. Implementation roadmap

Each stage is its own review. None of them start in this design branch.

**Stage A — Presentation of Today.** Objective: `/reports` becomes Today. It shows sales today, money received today, and the exact cash headline only after Stage B. It does not keep the card catalogue. Starter low-stock, when it ranks in the five, opens Inventory. Queries: existing today sales and today receipts. Entitlements unchanged. Tests: failed checks do not say “Nothing needs attention”; the header says Local time and names the tenant zone; Starter does not link to reorder or margins. Rollback: restore the hub component on `/reports`.

**Stage B — Cash difference query.** Objective: sum counted minus expected for every shift closed today. The headline shows the exact figure. An attention row appears only at an absolute GHS 5 or more. No settings screen. Tests: amounts of GHS 2 and GHS 5, two pages of shifts, open shifts excluded. Rollback: hide the cash headline.

**Stage C — Attention queries.** Objective: the eight ranked signals, capped at five, with plan-safe destinations. Tests: a failed query does not clear the list into “Nothing needs attention”; rank 8 does not replace a failed rank 2. Rollback: omit that row.

**Stage D — Navigation.** Objective: sidebar and mobile bar match section 5. Hide forecast and balance sheet. Remove `/settings/analytics` from nav without redirecting yet. `Download last week` can appear only after Trading has the week preset; the digest redirect waits for that. Tests: cashier has no reports link; Pro manager has consolidated operating nav and no audit link. Rollback: restore `REPORT_NAV_SECTIONS`.

**Stage E — Trading cleanup.** Objective: add `Last week (Monday–Sunday)`, then redirect the digest. Keep the CSV route and filename. Customer label: `Download last week`. Remove the mixed net-profit card. Rollback: show the old Trading cards.

**Stage F — Cash flow statement honesty.** Objective: correct labels and the formula before the statement is promoted in Statements. Until this stage, the route states its limits and is not in the reliable list. Tests: beginning cash, bank, MoMo, and operating cash are named as calculated. Rollback: keep the route withheld.

**Stage F2 — Balance sheet integrity.** Objective: correct inventory valuation and the balancing logic, then review it independently. Not part of the visual redesign. The route stays withheld, with no figures and no plug amount, until all of these pass: `Assets = Liabilities + Equity`; complete costs; incomplete costs; opening balances; inventory movements; retained profit; refunds and reversals; no unexplained balancing plug. This design branch does not change the accounting code. Rollback: leave the route withheld.

**Stage G — Pro consolidated Today.** Objective: branch comparison only when scope is explicit ALL, for Owner and Manager, on surfaces the catalogue already allows. Tests: omitted scope stays on one store; manager still cannot open Audit log. Rollback: hide the branch list.

**Stage H — Export alignment.** Objective: Wave B export gates. Own PR. The weekly file keeps its technical name.

**Stage I — Forecast return.** Objective: after double-counting is removed and the scenario control either changes the numbers or is deleted, the estimate may return under owner oversight. Until then the route shows withheld wording and no values.

**Stage J — Saved views.** Objective: Pro owner saves a report plus scope plus preset they can already view. Managers are not given this. Re-check entitlements on open.

**Stage K — Scheduled packs.** Objective: one weekly file to the owner. Not SMS. Not a manager feature.

**Stage L — Storefront route.** Objective: fix style tokens on `/settings/online-store/analytics`, then show that row only when storefront is entitled. Redirect `/settings/analytics` only after dependency checking. Separate from the Today presentation.

**Stage M — Retire duplicate routes.** Objective: after redirects have been in production, remove dead page bodies. Dependency review first.

Presentation stages are A and D. Query stages are B, C, E, F, F2, G, I. Navigation is D. Export work is H. Storefront is L.

## 16. Owner decisions

These rulings replace the previous open questions.

1. Cash-difference attention uses an absolute GHS 5 threshold. The exact difference always shows on the cash headline and in Cash Drawer. Amounts under GHS 5 do not take an attention slot. A later setting is allowed. None is added now.
2. `/reports` becomes Today in the first implementation stage. The card catalogue does not remain the landing page. Activity and More are the navigation.
3. Cash-flow forecast stays out of navigation until double-counting and the scenario control are corrected. The direct route says the estimate is withheld and shows no values.
4. A Manager on Pro may view consolidated operational reports where the catalogue already permits consolidation. Audit log, Owner brief, scheduled packs, and owner-governance features stay Owner-only. Stage 2 role entitlements are not widened.
5. Starter low stock opens Inventory. It does not open Stock to reorder.
6. Weekly Digest merges into Trading preset `Last week (Monday–Sunday)`. The CSV route and technical filename stay. The customer action is `Download last week`. The digest URL redirects only after Trading contains that week.

No product question in this amendment still needs an Owner ruling. The high-fidelity visual pass is the review surface. Implementation is not approved by this document.

## 17. What did not change

No production report calculation, entitlement catalogue, schema, export file, SMS path, or customer navigation was edited. The design branch adds a document, a review route, a gate that 404s on Production, and a unit test for that gate. Middleware behaviour for every existing path is unchanged. This visual pass does not correct the balance sheet.

## 19. High-fidelity visual pass

The approved structure stays. This pass replaces the sparse review styling with TillFlow’s customer shell.

**Baseline.** On the synthetic seed business, the authenticated shell, Reports hub, and POS were opened locally. Command Center, Trading, Cash Drawer, and the Income Statement returned the application’s not-found page for that unfinished seed, so those interiors were not claimed as a visual review. Source components used for the target language: `PageHeader`, `TopNav`, `BottomTabBar`, `.btn-primary`, `.card`, `.shell-nav-link`, and `shadow-card`.

| Element | Current strength | Current weakness | Preserve | Improve |
| --- | --- | --- | --- | --- |
| App header | Logo, identity, store chip, status | Setup banner can dominate | White header, chips, green status | Reports header stays compact |
| Reports hub | Soft cards, icons, bottom tabs | Catalogue, not a decision | Card radius, shadow, type | Today replaces the catalogue |
| Page header | Clear title card | Large and repeated | Display face, ink text | Tighter title, date, scope, refresh |
| Statements | Stat cards exist in source | Four equal cards, not a statement | Period, export actions | Aligned statement lines and totals |
| Empty and error | Shared empty component exists | Large blank areas | Icon-sized status, one action | Fit the status inside the page |

**Reused.** Paper `#F8FAFC`, ink `#111827`, accent `#1E40AF`, accent soft, success and amber, Plus Jakarta Sans and DM Sans, `rounded-2xl`, `shadow-card`, `btn-primary`, `btn-secondary`, `btn-ghost`, `shell-nav-link`, pills, and the mobile tab pattern.

**New, native pieces.** A sales-led summary with two quieter figures, a five-row attention list with a written High or Check mark, a grouped Activity list, a separate Downloads destination, and an income-statement table with a prior-month column. No new brand.

**Customer screens do not include** route names, blueprint commentary, Balance Sheet, or Cash-flow Forecast.

**Scores after browser review** at 320, 390, and desktop widths.

| Area | Score | Why |
| --- | --- | --- |
| Visual polish | 9.0 | Shell, cards, and type match the live app. The mark is a simple T, not the production logo file. |
| TillFlow consistency | 9.0 | Tokens, buttons, nav links, and chips are the existing ones. |
| Five-second clarity | 9.1 | Sales is the large figure. Scope and date sit above it. |
| Mobile usability | 9.0 | 320px preview does not scroll sideways. Targets are at least 44px. |
| Hierarchy | 9.1 | Sales leads. Money and cash are quieter. Totals are heavier than lines. |
| Trustworthiness | 9.0 | Exact amounts print. A failed load shows no figures. Incomplete costs hide profit. |
| Ghanaian retail relevance | 9.0 | Cedis, MoMo, and branch names stay in the sample. |
| Plan differentiation | 9.0 | Starter, Growth, Pro manager, and Pro owner change the nav. |
| Accessibility | 8.7 | Focus rings, text severity, and contrast were checked in the browser. No automated audit. |
| Implementation realism | 8.8 | Presentation can use the current shell. Queries stay in later stages. |
| Overall | 9.0 | |

## 18. Verdict

`REPORTS HIGH-FIDELITY DESIGN COMPLETE — READY FOR VISUAL OWNER APPROVAL`
