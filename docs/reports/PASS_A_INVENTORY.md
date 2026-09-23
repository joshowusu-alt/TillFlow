# Pass A — Report catalogue inventory (facts only)

## Identity of this evidence snapshot

| Field | Value |
|---|---|
| Audited application SHA | `b6e4bc828eacac5077c39e4114561806f918a205` |
| Branch that holds this write-up | `cursor/report-catalogue-entitlement-audit-35e2` |
| Audit timestamp | 2026-09-23. Close-out identity recorded 2026-09-23T17:29:12Z |
| Working tree at close-out start | Clean. `git status --porcelain` was empty. HEAD was `2f42dd349056273a587791990cfdc0dae6ed2944`, even with `origin/cursor/report-catalogue-entitlement-audit-35e2` |
| PR #111 head at close-out start | `2f42dd349056273a587791990cfdc0dae6ed2944` (draft, base `master`) |
| Production deployment | GitHub deployment `6604815196`, environment Production, state success, created 2026-09-23T02:08:52Z, SHA `b6e4bc828eacac5077c39e4114561806f918a205`, environment URL `https://supermarket-g96kisf9c-joshua-owusus-projects.vercel.app` |
| Inventory method | Static read of report routes, `lib/reports`, export route handlers, the daily-summary cron, and navigation config on SHA `b6e4bc8`. No production database. No runtime probe. No Preview or Production deploy |
| Evidence references | Files cited in the sections below. Calculation confidence in the 49-row bridge (`DUPLICATION_AND_RETIREMENT_MAP.md`) cites a test file, a reconciliation function, or the source query. It does not cite this prose |

`git diff b6e4bc828eacac5077c39e4114561806f918a205..2f42dd349056273a587791990cfdc0dae6ed2944` touches only `docs/reports/*`. Application bytes at the audited SHA and at PR head `2f42dd3` are the same.

SHA mixing: not mixed. Behaviour statements are about `b6e4bc8`. That SHA is also the GitHub Production deployment above. Older deployment notes in `docs/reporting/` (`dbf2d190`, `38ae81f8`, and their Vercel deployment ids) were not used as evidence. `tillflow.app` / `www.tillflow.app` were not fingerprinted. `/api/qa/deploy-sha` is disabled on Production, so the alias is not confirmed here. Pass A conclusions stay revisable if later evidence disproves them. Interpretation is not a frozen fact; frozen decisions are marked in the other five contract files.

No production change, calculation change, migration, or report deletion was made. This close-out does not deploy and does not merge PR #111.

The 46-row map in `DUPLICATION_AND_RETIREMENT_MAP.md` mixes engines and symptoms. It is not the surface count. The 49 surfaces in §1 are reconciled one-for-one in that file’s bridge. 49 discovered surfaces = 49 bridge rows.

Investigation date: 2026-09-23. Scope is the TillFlow application in this repository. This document records what the code does today. It does not propose a redesign. Pass B contracts are separate files and were written only after this inventory.

Engineering owner: not identifiable. There is no `CODEOWNERS` file and report modules do not name an owner.

---

## 1. How surfaces were counted

A **report surface** is a user-facing screen, download, or scheduled delivery that shows business records or a calculated business number. Navigation-only chrome is counted once (the Reports hub). A redirect with no UI is not a surface.

| Class | Count | What is included |
|---|---:|---|
| Screens under `/reports` | 22 | Every `page.tsx` except `/reports/sales`, which only redirects |
| Owner Home dashboard | 1 | Completed owner home at `/onboarding` |
| Record screens the catalogue or reports deep-link to | 5 | Sales history, customer receipts, supplier ageing, supplier payments, cash-drawer supporting rows |
| Download endpoints | 20 | CSV, XLSX, HTML-PDF, or ZIP handlers listed in §6 |
| Scheduled delivery | 1 | Cron owner daily summary. Outbox `channel` is `SMS` (`enqueueOwnerDailySummarySms`). The enable flag is named `whatsappEnabled` |
| **Report surfaces found** | **49** | Sum of the rows above |

`/demo/reports` is a marketing/demo page (`app/demo/reports/page.tsx`, fixtures in `lib/demo-fixtures/reports.ts`). It is not a live tenant report and is not in the 49.

A **distinct calculation** is a numeric or ledger engine with its own filters, not a second page that calls the same function.

**Apparently distinct calculations found: 18.** Several answer the same business question with different filters. Those contradictions are in §8. They are not 18 different business questions.

Roles found in auth and navigation: `OWNER`, `MANAGER`, `CASHIER` (`lib/auth.ts`, `lib/navigation-config.ts`). There is no `permissions.ts` and no `canViewProfit` / `canViewCost` flag.

Plan source: `getBusinessPlan` / `getFeatures` / `hasPlanAccess` in `lib/features.ts`.

- Explicit `plan` of `STARTER` | `GROWTH` | `PRO` wins.
- Legacy bridge: `ADVANCED` + `MULTI_STORE` → Pro; `ADVANCED` → Growth; otherwise Starter.
- `multiStore` is true only when `storeMode === 'MULTI_STORE'` **and** plan rank is Pro. A non-Pro business with more than one `Store` row does not get the feature flag, but several reports still query every store (see leaks).

Reports shell: `app/(protected)/reports/layout.tsx` calls `requireBusiness(['MANAGER', 'OWNER'])`. A cashier cannot open any `/reports/*` page through that layout. Export route handlers do **not** run that layout; they authenticate themselves.

---

## 2. Shared mechanics (apply unless a surface says otherwise)

### 2.1 Two date systems

| System | Where | Boundary | Timezone |
|---|---|---|---|
| Reporting scope | `lib/reports/reporting-scope.ts` | `startInclusive <= t < endExclusive` | `Business.timezone` via `resolveBusinessTimeZone`. Tests and fallback use `Africa/Accra` (`DEFAULT_BUSINESS_TIMEZONE` in `lib/notifications/utils.ts`) |
| Legacy report dates | `lib/reports/date-parsing.ts` `resolveReportDateRange` / `resolveSelectableReportDateRange` | Inclusive `setHours(0,0,0,0)` through `23:59:59.999` | **Server local**, not `Business.timezone` |
| Supplier ageing as-of | `app/(protected)/payments/supplier-aging/page.tsx` | UTC start of the `asOf` calendar day | UTC, not business timezone |

Surfaces on the reporting-scope clock: Owner Home sales, Trading Report, Money Received, MoMo Confirmation, Business Movement, Receipt transactions.

Surfaces on the server-local clock include: Profit Margins, Sales Analytics, Cash Drawer, Stock Movements, Weekly Digest week math, Income Statement / Cashflow / Balance Sheet exports, Owner Brief “today/yesterday”, Today KPIs “today”, most `/exports/*` date ranges.

### 2.2 Sale and payment exclusions (canonical scope)

From `lib/reports/reporting-scope.ts`:

- Sale statuses excluded from recognised sales: `RETURNED`, `VOID`.
- Payment statuses excluded from the revenue-side credit helper: `FAILED`, `CANCELLED`, `VOID`.

Money Received is a different rule: only `SalesPayment.status === CONFIRMED`, timestamp `receivedAt`. A confirmed receipt is **not** removed because the parent invoice is `RETURNED` or `VOID` (comments in `lib/reports/money-received/compute.ts`, DEP-PAY-1). Refunds are `SalesReturn` rows of type `RETURN`, summed separately.

### 2.3 Plan gate pattern

`AdvancedModeNotice` (`components/AdvancedModeNotice.tsx`) renders a locked page and links to `/settings/billing`. It does not redirect. The Reports hub (`app/(protected)/reports/page.tsx`) never blocks navigation. `hasPlanAccess` only changes the card badge text (lines 362–365). Cards for a higher plan stay clickable.

Feature flags used by reports (`lib/features.ts`):

| Flag | Minimum plan | Used by |
|---|---|---|
| `advancedReports` | Growth | Analytics, margins, reorder, sales-by-supplier, some Command Center links |
| `financialReports` | Growth | Income statement, balance sheet, cashflow, and `/api/reports/financials` |
| `riskMonitor` | Growth | Risk Monitor page and `/exports/risk-summary` |
| `advancedOps` | Growth | Daily owner summary settings/preview, not the cron enqueue |
| `ownerIntelligence` | Pro | Owner Brief page and `/reports/owner/export` |
| `cashflowForecast` | Pro | Cashflow Forecast page |
| `auditLog` | Pro | Audit Log page |
| `multiStore` | Pro and `MULTI_STORE` | Feature flag only. Not consulted by Business Movement |

### 2.4 Freshness

No report loader reads offline outbox state or a “last synced” timestamp. Searches under `app/(protected)/reports` and `lib/reports` found no `offline`, `sync`, or `lastSynced` handling.

What does exist:

| Cache | TTL | Tag |
|---|---|---|
| `getTodayKPIs` | 30s | `reports` |
| Trading dashboard snapshot | 60s | `reports`, `trading-dashboard` |
| Owner dashboard | 60s | `owner-dashboard` |
| Weekly digest | 3600s | `reports` |
| Income statement, balance sheet, cashflow | 300s | `reports` |
| Cashflow forecast | 300s | (forecast module) |

Writes in sales, shifts, payments, and inventory call `revalidateTag('reports')` (see `lib/reports/cache-revalidation.ts`). Command Center auto-refreshes every 60s, Trading Report every 120s, Owner Brief every 60s. Owner Home refreshes on visibility via `components/owner-home/OwnerHomeRefresh.tsx`. Pull-to-refresh calls `refreshCurrentView` (`app/actions/refresh.ts`).

Server timing thresholds in `lib/observability.ts`: route 1500ms, report 2500ms, critical 5000ms. Trading Report, Analytics, and Owner Brief stream the shell and load the body in `Suspense`.

### 2.5 Gross profit is not one formula

| Engine | Revenue field | Cost | Return handling | Shown with a data-quality state? |
|---|---|---|---|---|
| Trading Report | Recognised invoice `totalPence` for the sales card; GP uses `lineSubtotalPence` | `lineCostPence` if `> 0`, else `Product.defaultCostBasePence * qtyBase` | Invoice status not `RETURNED`/`VOID` | No. Incomplete costs are folded into the number via default cost, including default cost `0` |
| Today KPIs / Command Center | Line subtotal vs cost for GP; sales card uses invoice totals | Same line-or-default pattern | Invoice status | Subtitle “No cost data” only when the KPI object is null, not when costs are zero |
| Income statement | `lineSubtotalPence` | `lineCost` or `defaultCostBasePence * qty` | Invoice `paymentStatus` not `RETURNED`/`VOID`. **No store filter** | Yes. `incompleteStockDisclosureMessage` from `lib/reports/incomplete-stock.ts` |
| Margin analysis | `lineSubtotalPence` | line cost or default × qty | Invoice status **and** lines whose invoice has a `salesReturn` relation are dropped | Cost-check labels on rows. Page is Growth-gated. No Ready/Incomplete/Hidden state on the total |
| Sales Analytics | `lineSubtotalPence` | line cost or default × qty | Invoice status only. No `salesReturn` drop | No |
| Weekly digest headline | Stored `SalesInvoice.grossMarginPence` | Not recomputed from lines | Invoice status | No |
| Weekly digest “top margin” | `lineTotalPence` | `(defaultCostBasePence / 100) * qty` then `estCost * 100` | Invoice status | No. The `/100` then `* 100` does not match pence costs used elsewhere |

`lib/reports/incomplete-stock.ts` states that missing cost must not be treated as zero profit. Trading Report, Command Center, Today KPIs, Weekly Digest, and Analytics do not use that snapshot. Income statement does.

### 2.6 WhatsApp / share

There is no per-report share or WhatsApp button on report pages. The only scheduled owner delivery is the daily summary SMS path (`app/api/cron/eod-summary/route.ts` → `enqueueOwnerDailySummarySms`). Settings and preview require Growth (`lib/notifications/daily-summary-access.ts`, `features.advancedOps`). The cron route does not call that check.

---

## 3. Screen inventory

Fields below are from the page and the function it calls. “Plan: none” means the page does not consult `getFeatures` before rendering numbers.

### 3.1 Reports hub — `/reports`

- Files: `app/(protected)/reports/page.tsx`
- Question: which report should I open?
- Calculation: none.
- Roles: `MANAGER`, `OWNER`.
- Plan: badge only. Cards with `minimumPlan` still link through.
- Catalogue cards and their **index** gates (page gates are in the sections below):

| Card | Route | Index `minimumPlan` | Index roles |
|---|---|---|---|
| Operations Today | `/reports/command-center` | none | MANAGER, OWNER |
| Owner Brief | `/reports/owner` | PRO | OWNER |
| Weekly Digest | `/reports/weekly-digest` | none | |
| Risk Monitor | `/reports/risk-monitor` | GROWTH | |
| Trading Report | `/reports/dashboard` | none | |
| Money Received | `/reports/money-received` | none | |
| MoMo Confirmation | `/reports/momo-confirmation` | none | |
| Business Movement | `/reports/business-movement` | none | |
| Sales Analytics | `/reports/analytics` | GROWTH | |
| Cash Drawer | `/reports/cash-drawer` | none | |
| Reorder Suggestions | `/reports/reorder-suggestions` | GROWTH | |
| Stock Movements | `/reports/stock-movements` | none | |
| Sales by Linked Supplier | `/reports/sales-by-supplier` | GROWTH | |
| What customers owe | `/payments/customer-receipts` | none | |
| What you owe suppliers | `/payments/supplier-aging` | none | |
| Supplier payments | `/payments/supplier-payments` | none | |
| Profit Margins | `/reports/margins` | GROWTH | |
| Income Statement | `/reports/income-statement` | GROWTH | |
| Cashflow | `/reports/cashflow` | GROWTH | |
| Balance Sheet | `/reports/balance-sheet` | GROWTH | |
| Cashflow Forecast | `/reports/cashflow-forecast` | PRO | OWNER |
| Exports | `/reports/exports` | none | |
| Audit Log | `/reports/audit-log` | PRO | OWNER |

Desktop nav (`lib/navigation-config.ts`) repeats these gates and adds `/reports/stock-movements` with no plan gate. Mobile owner Reports browse (`lib/navigation/mobile-menu-config.ts`) lists only Hub, Owner Brief (Pro), and Analytics (Growth), plus Cash Drawer and Stock Movements under other areas. Mobile does not list every desktop report link.

### 3.2 Owner Home — `/onboarding` when setup is complete

- Files: `components/owner-home/OwnerHomeCompletedStream.tsx`, `components/owner-home/HomePerformanceSlot.tsx`, `lib/reports/home-performance-kpis.ts`, `lib/reports/home-expected-cash.ts`, `lib/owner-home/attention.ts`, `lib/reports/home-issue-count.ts`
- Question: what happened today, and what needs attention?
- Widgets:
  1. Sales revenue today, or product count if `saleCount === 0`. `getSalesRevenueSummary` on a business-timezone today scope, `storeId: 'ALL'`.
  2. Transaction count from that same summary.
  3. Expected cash = sum of `Shift.expectedCashPence` for open shifts. **0 if no open shift.** Not counted cash. Not variance.
- Attention actions (not a max of three): Close shift, Command Center issue count, Reorder (only if Growth `advancedReports`), supplier payments due.
- Issue count is 0–9 category flags from Today KPIs: stockout imminent, urgent reorder, AR over 60, any outstanding AP, cash variance, MoMo pending, negative-margin products, discount overrides, open HIGH risk alerts.
- Subtitle copy: “Today · All branches” even when the business is single-store.
- Roles: owner home is the owner journey. Cashiers are sent to `/pos` from `app/page.tsx`.
- Plan: none on the three hero numbers. Reorder attention is Growth-only.
- Root `/` sends an owner to `/reports/owner` on Pro and `/reports/dashboard` otherwise (`app/page.tsx`). It does not send them to Owner Home.
- Empty: zero sales swaps the first card to a product count.
- Freshness: no sync state.
- Mobile: this is the owner phone Home tab.
- Confidence: **High** for today sales (shared `sales-revenue` contract). **High** for the open-shift sum. **Med** for the issue count, because it depends on Today KPIs (§3.3).
- Duplicate candidate: Trading Report “today”, Command Center posture, Owner Brief overview.

### 3.3 Operations Today (Command Center) — `/reports/command-center`

- File: `app/(protected)/reports/command-center/page.tsx`. Data: `getTodayKPIs` in `lib/reports/today-kpis.ts`.
- Question: what needs attention today across the business?
- Posture strip: today’s sales (`SalesInvoice` totals, not `RETURNED`/`VOID`), gross margin %, today’s receipts, outstanding debtors, open issue count.
- Today’s receipts and `paymentSplit` use `aggregateMoneyReceivedByMethod`, but the window is **server-local midnight** passed in with `timeZone: DEFAULT_BUSINESS_TIMEZONE` (`Africa/Accra`), not `Business.timezone` (`today-kpis.ts` around the `todayStart.setHours` block).
- Gross margin: sum of line subtotal minus line cost or default cost × qty. No incomplete-cost state. Tone goes danger under 10% and warning under 20%.
- Debtors and supplier balances: open `UNPAID`/`PART_PAID` invoices with `createdAt >= now - 90 days` only. Older open invoices are omitted.
- Cash variance: sum of `abs(Shift.variance)` on closed shifts in the last 7 days, `take: 200`.
- Expenses: `PAID` expenses by `createdAt` windows inside the KPI object (not all shown on the strip).
- Liquid assets: GL cash+bank if &gt; 0, else opening balances + confirmed receipts − purchase payments − expense payments (`getOperationalLiquidAssetsEstimatePence`). Null if the receipt query fails.
- Branch: header says “All branches”. `getTodayKPIs(business.id)` is called with no `storeId`.
- Roles: `MANAGER`, `OWNER`. Plan: page loads on Starter. Growth links and “top supplier this month” render only when `advancedReports`. Owner Brief / forecast links render only when `ownerIntelligence`.
- Export: none on the page.
- Empty: em dashes and “No data” when KPIs are null.
- Cache: 30s. Mobile: responsive layout, not a separate component.
- Confidence: **Med**. Sales definition is clear; the receipt clock is not the business timezone; AR/AP are a 90-day slice; GP has no data-quality state.
- Duplicate candidate: Owner Home, Trading Report today, Owner Brief.

### 3.4 Trading Report — `/reports/dashboard`

- Files: `app/(protected)/reports/dashboard/page.tsx`, `TradingDashboardContent.tsx`. Sales: `getSalesRevenueSummary` (`lib/reports/sales-revenue.ts`). Receipts: `getMoneyReceivedSummary` (`lib/reports/money-received/trading-surface.ts`). Expenses: `getIncomeStatement`.
- Question: how did this period trade — sales, profit, receipts, debt, stock?
- Default period: `7d` on the reporting-scope clock (today and the prior 6 business-local days).
- KPI row, all plans, no feature check:
  - Sales revenue = Σ `SalesInvoice.totalPence`, status not `RETURNED`/`VOID`, `createdAt` in scope. Includes credit sales.
  - Gross profit = costed lines (`lineCostPence > 0`) plus uncosted lines valued at `defaultCostBasePence` (0 if missing). Helper text: “Profit before expenses.” No incomplete state.
  - Expenses = income-statement `otherExpenses` (journals). Copy states expenses and net profit stay **business-wide** even when a branch is selected.
  - Net profit = gross profit − those expenses.
  - Credit sales outstanding = unpaid portion of in-period invoices, cap 5000 credit rows in `getSalesRevenueSummary`.
  - Supplier balances = open purchase outstanding (this snapshot, not the 90-day Today KPI window).
- Also: money-received method bars, void/return/adjustment counts, expected-vs-counted from closed shifts in the period (`take: 100`), debtor ageing, low stock, best sellers.
- Receipts split by `receiptOrigin`: `RECEIVED_AT_SALE`, `LATER_CREDIT_COLLECTION`, unknown. The page states that sales, money received, and cash drawer will not match.
- Branch: store `<select>` when `stores.length > 1`.
- Roles: `MANAGER`, `OWNER`. Plan: none.
- Export: none on this page. Deep links: Money Received, Cash Drawer, sales list, reorder, analytics, supplier payments, customer receipts.
- Mobile: `<details className="details-mobile">` filters. Method display is bar strips, not a chart library.
- Cache: 60s. Streamed body.
- Confidence: **High** for sales revenue and money received (shared contracts and tests). **Med** for gross profit and net profit, because missing cost becomes a confident number and expenses ignore the branch filter.
- Duplicate candidate: Owner Home sales, Command Center sales/GP/receipts, Income Statement, Money Received, Cash Drawer variance.

### 3.5 Money Received — `/reports/money-received`

- Files: `app/(protected)/reports/money-received/page.tsx`, `lib/reports/money-received/*`.
- Question: how much confirmed money arrived in this period, by method, and what is still unconfirmed?
- Formula: Σ `SalesPayment.amountPence` where `status = CONFIRMED` and `receivedAt` is in the business-timezone scope. Method totals are reconciled to the headline (`reconcileMethodBreakdownToMoneyReceived`). Unverified = status outside the classified set. Refund outflows = Σ `SalesReturn.refundAmountPence` where type is `RETURN`. Negative confirmed amounts are sale-amendment outflows.
- Parent invoice `RETURNED`/`VOID` does not drop a confirmed receipt.
- Default range: last 7 days via `resolveReportDateRange` on the page shell; the metric scope is then resolved through `resolveMoneyReceivedScope`.
- Branch: `resolveMoneyReceivedAccess` — actor business only; `storeId` must be in the business’s stores; role must be `OWNER` or `MANAGER`.
- Plan: none.
- Export: `/exports/money-received` (streaming CSV, pages of 500, no total row cap, no plan check, same access function).
- Empty: explicit empty copy when no confirmed receipts. Query failure is `queryFailed` and must not be shown as a real zero (`gatedMetricResult` returns null pence for blocked metrics).
- Mobile: responsive stat grid.
- Confidence: **High**. Covered by `money-received*.test.ts` and access tests.
- Duplicate candidate: Trading Report method bars, Weekly Digest payment split, Command Center “today’s receipts”, Cash Drawer (different engine).

### 3.6 MoMo Confirmation — `/reports/momo-confirmation`

- Files: `app/(protected)/reports/momo-confirmation/page.tsx`, `lib/reports/momo-confirmation/query.ts`.
- Question: which Mobile Money payments are waiting for manual confirmation?
- Formula: list of payments in the confirmation queue. Page copy states they are **not** in Money Received until confirmed.
- Default: last 30 days. Branch filter. Roles: `MANAGER`, `OWNER`. Plan: none.
- Export: `/exports/momo-confirmation`, 500 per page, no plan check, same money-received access helper.
- Mobile: `MomoConfirmDrawer`.
- This is an operational queue, not a second money total.
- Confidence: **High** for the exclusion rule. **Med** for queue completeness (depends on confirmation status values in `lib/reports/momo-confirmation/types.ts`).
- Duplicate candidate: filtered view of payment flow, not a new total.

### 3.7 Receipt transactions — `/reports/receipts`

- File: `app/(protected)/reports/receipts/page.tsx`.
- Question: which receipt rows make up money received?
- Default period: `today` on reporting scope. Branch filter. Roles: `MANAGER`, `OWNER`. Plan: none. Export: none.
- Mobile: `md:hidden` card list plus a desktop table.
- Deep link back to Money Received.
- Confidence: **High** as a list of the same payment rows.
- Duplicate candidate: Money Received drill-down.

### 3.8 Business Movement — `/reports/business-movement`

- Files: `app/(protected)/reports/business-movement/page.tsx`, `lib/reports/business-movement/*`.
- Question: what changed versus the comparison period — sales, money received, products, branches, cashiers?
- Default preset: `last_full_calendar_month` versus the previous month, business timezone (`periods.ts`).
- Sales headline: Σ `SalesInvoice.totalPence`, status not `RETURNED`/`VOID`, half-open `createdAt`. Same filter as `sales-revenue`.
- Product movers: Σ `lineTotalPence` (not `lineSubtotalPence`).
- Money layer: Money Received bundle. Leakage = sales value − money received (`money-leakage.ts`). On query failure, facts are set to **0** with `queryFailed: true`.
- Branch table: per-store sales and transaction counts for both periods. Collapsed to a sentence only when `singleBranchNote` says there is one branch. **No plan check.**
- Cashier table: per-cashier sales value and transaction counts. Collapsed only when there is a single cashier. Sort is by the movement result, which is sales change. **No plan check.**
- Stock insights are hard-coded off: `stockInsightsEmitted: false`, `stockAvailabilityReadiness: NOT_RELIABLE`.
- Export: `/exports/business-movement` streams a complete CSV (`X-Export-Completeness: COMPLETE_STREAM`). Access matches Money Received (role, tenant, branch). **No plan check.** The CSV includes branch and cashier sections (`business-movement-ui.test.ts` expects `branch`).
- Roles: `MANAGER`, `OWNER`.
- Confidence: **High** for the sales filter and the explicit stock placeholder. **Med** for product revenue because it uses `lineTotalPence`. **Low** as a Pro branch report, because nothing stops Starter or Growth from seeing branch comparison when two stores exist.
- Duplicate candidate: Trading Report sales, Money Received, Analytics product performance, Weekly Digest cashier table, a future branch report.

### 3.9 Weekly Digest — `/reports/weekly-digest`

- Files: `app/(protected)/reports/weekly-digest/page.tsx`, `lib/reports/weekly-digest.ts`, `app/api/reports/weekly-digest/route.ts`.
- Question: how did last week compare with the week before?
- Default: `weekOffset = -1` (previous week). Week bounds are shifted with `setDate` / `setHours` (server local).
- Headline sales: Σ `totalPence`. Headline GP: Σ stored `grossMarginPence`. GP% = round(GP / sales).
- Money: `aggregateMoneyReceivedByMethod` with `timeZone: DEFAULT_BUSINESS_TIMEZONE`, not the business timezone.
- Also: void count (invoices with status `VOID`), return count (`SalesReturn` type `RETURN`), discount-override count, `StockAdjustment` count (not `StockMovement`), top 5 sellers by `lineTotalPence`, top 5 margin items using the `/100` cost formula in §2.5, cashier performance (sales, tx, discount overrides), risk cashiers (void alerts, discount alerts, abs shift variance).
- Previous-week comparison is on the page for every plan.
- Branch: none. Business-wide.
- Roles: `MANAGER`, `OWNER`. Plan: none on page or CSV.
- Export: `GET /api/reports/weekly-digest?week=`. Includes gross profit, GP%, top margin, cashier performance.
- Cache: 1 hour.
- Confidence: **Low** for gross profit and top margin (stored field and the `/100` estimator). **Med** for sales and voids. **High** that this is a second comparison engine available on Starter.
- Duplicate candidate: Trading Report, Money Received, margin report, staff activity, risk monitor.

### 3.10 Sales Analytics — `/reports/analytics`

- Files: `app/(protected)/reports/analytics/page.tsx`, `AnalyticsContent.tsx`, `AnalyticsClient.tsx`, `AnalyticsPeriodSelector.tsx`.
- Question: how do sales, products, categories, and hours move versus the previous window?
- Page gate: `features.advancedReports` or `AdvancedModeNotice` (Growth). Gate runs before the snapshot load.
- Period: `resolvePeriodDays`, default 7 if invalid. Bounds are server-local calendar days, plus an equal previous window.
- Product stats: Σ `lineSubtotalPence`, cost = line cost or default × qty, top 10 by revenue. No `salesReturn` relation filter. No branch filter.
- Export: none on the page.
- Roles: `MANAGER`, `OWNER`.
- Confidence: **Med**. Math matches the line-GP family, but the clock and return filter differ from Margin Analysis and from reporting-scope.
- Duplicate candidate: Trading Report best sellers, Margin Analysis, Business Movement product movers.

### 3.11 Profit Margins — `/reports/margins`

- Files: `app/(protected)/reports/margins/page.tsx`, `lib/reports/margin-analysis.ts`.
- Question: which sold products are below cost or below the target margin?
- Gate: `advancedReports` before `getMarginAnalysisSnapshot`.
- Default period: `30d` via `resolveSelectableReportDateRange` (server local). Presets include 7, 14, 30, 90, 365, month-to-date, custom. No 13-month cap.
- Per product: Σ revenue (`lineSubtotal`), Σ cost (line cost or default × qty), margin% = profit / revenue. Below cost, or below `minimumMarginThresholdBps` (product or business default 1500 bps = 15%).
- Lines whose invoice has a `salesReturn` relation are dropped, which is stricter than other GP surfaces.
- No branch filter.
- Export buttons: `/exports/margins?format=xlsx|pdf`. **That route has no `getFeatures` check** (`app/(protected)/exports/margins/route.ts`). It calls `getMarginAnalysisSnapshot` for any `MANAGER` or `OWNER`.
- Empty: filters can yield an empty table; the snapshot itself is all sold products in range.
- Mobile: `details-mobile` filters.
- Confidence: **High** for the row math. **Med** for agreement with other GP surfaces. **High** that the export is an entitlement leak.
- Duplicate candidate: Trading Report GP, Analytics products, Income Statement COGS.

### 3.12 Income Statement — `/reports/income-statement`

- Files: page plus `getIncomeStatement` in `lib/reports/financials.ts`.
- Question: revenue, COGS, other income, expenses, and profit for a period.
- Gate: `financialReports` (Growth) before load. API `GET /api/reports/financials?type=income-statement` returns 403 `"Growth plan required"` when the flag is false.
- Default: month start through today, server local, end set to `23:59:59.999` in the API.
- Revenue and COGS from sale lines. Other expenses from journal `EXPENSE` lines except the COGS account. Other operating income from journal `INCOME` except the sales account. Net = GP − other expenses + other operating income.
- **No store filter.** Business-wide.
- Incomplete stock message is rendered when `getIncompleteStockSnapshot` says profit may be incomplete.
- Roles: `MANAGER`, `OWNER`.
- Cache: 300s.
- Confidence: **Med**. Line math is consistent with the GP family; the inclusive server-local range and lack of branch scope are not.
- Duplicate candidate: Trading Report net profit (Trading subtracts expenses from its own GP, which can disagree).

### 3.13 Balance Sheet — `/reports/balance-sheet`

- Files: page, `getBalanceSheet` in `lib/reports/financials.ts`.
- Question: assets, liabilities, and equity as of a date.
- Gate: `financialReports`. API type `balance-sheet` uses the same 403.
- As-of defaults to today. Journal balances with `entryDate <= asOf`. Inventory is adjusted by (sale-line net profit − journal net profit). If there are no `OpeningBalance` rows, `openingCapitalPence` is applied to cash.
- No store filter.
- Incomplete-stock disclosure is attached via the income-statement path used for current profit.
- Confidence: **Med**. The inventory plug is an explicit reconciliation adjustment, not a subledger tie-out shown as a control total on the page.
- Duplicate candidate: no second balance-sheet page. Cash overlaps liquid-assets in Today KPIs.

### 3.14 Cashflow — `/reports/cashflow`

- Files: page, `getCashflow` in `lib/reports/financials.ts`.
- Question: how did profit and working capital change cash?
- Gate: `financialReports`. API type `cashflow` uses the same 403.
- Formula: net cash from operations = net profit − ΔAR − Δinventory + ΔAP. Beginning cash = cash GL + legacy opening. This is **not** the payment ledger and **not** Money Received.
- Default: same month-to-date window as the income statement. No store filter.
- Confidence: **Med**.
- Duplicate candidate: Money Received and Cash Drawer, which answer different questions but are easy to confuse with this statement.

### 3.15 Cashflow Forecast — `/reports/cashflow-forecast`

- Files: page, `lib/reports/forecast.ts`.
- Question: what cash pressure is likely over the next 14 or 30 days?
- Gate: `features.cashflowForecast` (Pro) and role `OWNER` only. No export route.
- Default horizon 14 days, scenario `expected`.
- Starting cash = cash GL + legacy `openingCapital`. Inflow per day ≈ 0.85 × AR due that day + average daily cash sales. Outflow = AP due + average daily expenses. Best/worst scenarios multiply those.
- Average daily cash sales = sum of `CASH` and `MOMO` `SalesPayment` amounts over 14 days **where the parent invoice is not `RETURNED`/`VOID`**. There is **no `CONFIRMED` filter**.
- Average daily expenses = paid expenses / 30.
- Confidence: **Med** for the projection arithmetic, **Low** for treating it as Money Received, because payment status is not the canonical confirmed set.
- Duplicate candidate: Money Received trailing average, Balance Sheet cash.

### 3.16 Cash Drawer — `/reports/cash-drawer`

- Files: `app/(protected)/reports/cash-drawer/page.tsx`, `lib/services/cash-drawer.ts`.
- Question: for these shifts, what cash was expected, what was counted, and what was the difference?
- Shifts with `openedAt` in a default 7-day server-local range. Entry totals from `summarizeCashDrawerEntries` (Σ `CashDrawerEntry.amountPence` by `entryType`, including `CASH_DEBTOR_PAYMENT`).
- Header expected / counted / variance uses **closed** shifts only and skips `isInvalidLegacyClose`.
- Branch select. Roles: `MANAGER`, `OWNER`. Plan: none.
- Exports: `/exports/eod-csv` and `/exports/eod-pdf` with the same date and store query. No plan check. Page copy says this is physical till activity, not Money Received.
- Deep links: `/shifts/drawer`, Trading Report `#money-received`, `/reports/receipts?period=today`.
- Mobile: `lg:hidden` ledger uses the same server rows as the desktop table (`mobile-parity-p2.test.ts`).
- Empty: no shifts in range → empty ledger; totals are over closed shifts only, so a range of open shifts can show zeroes in the header.
- Confidence: **High** for the entry sum and the closed-shift header. **Med** for date alignment with Trading Report variance (different clock, `take: 100` there).
- Duplicate candidate: shift variance on Trading Report, Today KPIs 7-day abs variance, Risk Monitor cash-variance alerts.

### 3.17 Cash drawer supporting rows — `/shifts/drawer`

- File: `app/(protected)/shifts/drawer/page.tsx`.
- Question: which drawer entry rows support the shift?
- Auth: `requireBusinessAndOptionalStore()` **with no role array**. `requireBusiness` without roles allows any signed-in role, including `CASHIER`.
- Plan: none. Export: none. Optional `from`/`to`. Operational store required.
- Confidence: **High** that this is a row list. **High** that the role gate is wider than Cash Drawer.
- Duplicate candidate: Cash Drawer report.

### 3.18 Stock Movements — `/reports/stock-movements`

- File: `app/(protected)/reports/stock-movements/page.tsx`.
- Question: what stock ledger rows were written (sales, purchases, returns, adjustments, transfers)?
- Query: `StockMovement` for the business’s stores, `createdAt` in a default 7-day server-local range. Stats are `totalCount` only. No quantity sum. No value sum.
- Branch filter. Roles: `MANAGER`, `OWNER`. Plan: none. Export: none on the page. Movement rows are inside the export pack ZIP (see §6).
- Transfer types `TRANSFER_IN` / `TRANSFER_OUT` appear in this ledger. There is no `/reports/transfers`.
- Mobile: filters in `details-mobile`; table `hidden md:block`.
- Empty: empty table when the range has no rows.
- Confidence: **High** as a ledger list. It does not compute shrinkage.
- Duplicate candidate: weekly digest `StockAdjustment` count (different table), risk “large adjustment” alerts.

### 3.19 Reorder Suggestions — `/reports/reorder-suggestions`

- File: `app/(protected)/reports/reorder-suggestions/page.tsx`.
- Question: what should be reordered given recent sales and on-hand quantity?
- Gate: `advancedReports` before the query.
- Formula: `avgDailyDemand = qtyBase sold / lookbackDays` (default 14) on invoices not `RETURNED`/`VOID` for **one store**. `reorderTarget = ceil(avgDailyDemand × leadDays + reorderPointBase)` (lead default 7). `suggestedQty = max(reorderTarget − onHand, 0)`. Urgent when days of cover ≤ lead time. Cap 200 rows. Requires a store selection.
- Roles: `MANAGER`, `OWNER`. Export: none.
- Confidence: **High** for the arithmetic on the page. **Med** for demand quality (no exclusion of unusual bulk sales; server-local dates).
- Duplicate candidate: low-stock counts on Trading Report and Today KPIs (`summarizeInventoryRisk` in `lib/reports/operational-metrics.ts`), which use reorder point only, not velocity.

### 3.20 Sales by Linked Supplier — `/reports/sales-by-supplier`

- Files: page, `lib/reports/supplier-sales.ts`, `app/(protected)/reports/sales-by-supplier/export/route.ts`.
- Question: how much revenue is on products whose **preferred supplier** is this supplier? Page copy says this is not supplier debt.
- Gate: `advancedReports`. Export route returns 403 when the flag is false.
- Revenue = Σ `lineTotalPence`. Sales count = distinct invoice ids. Status not `RETURNED`/`VOID`. Default period `mtd` on the selectable date helper (server local). No branch filter.
- Top-supplier card on Command Center uses `getTopLinkedSupplierForMonth` (server-local calendar month) and only renders for Growth+.
- Confidence: **High** that it is not AP. **Med** versus other product revenue fields (`lineTotal` vs `lineSubtotal`).
- Duplicate candidate: product dimension of sales, not supplier payables.

### 3.21 Risk Monitor — `/reports/risk-monitor`

- Files: page, `lib/services/risk-monitor.ts`.
- Question: which control alerts fired, and how do they cluster by cashier?
- Gate: `riskMonitor` (Growth) before the query. Export `/exports/risk-summary` checks the same flag.
- Default range: 7 days, server local. Branch select.
- Page lists `RiskAlert` rows and a cashier table built from invoices with `discountPence > 0` or an approved override.
- Detectors that **write** alerts include void frequency, excessive discount basis points, negative-margin sale, large stock adjustment, and cash variance. Thresholds live in `lib/services/risk-monitor.ts`.
- On-screen subtitle: “Anti-fraud alerts and cashier trends.” Locked-state copy: “anti-fraud monitoring”.
- Roles: `MANAGER`, `OWNER`. No extra permission.
- Confidence: **High** that alerts are stored rows. **Med** that the cashier table matches the detectors (the table also aggregates invoice discounts directly).
- Duplicate candidate: Weekly Digest risk cashiers, Business Movement cashier table, Cash Drawer variance.

### 3.22 Owner Brief — `/reports/owner`

- Files: `app/(protected)/reports/owner/page.tsx`, `OwnerDashboardBody.tsx`, `lib/reports/owner-dashboard.ts`, `lib/owner-intel.ts`.
- Question: what is business health, leakage, stock pressure, and cash right now?
- Gate: `ownerIntelligence` (Pro) and role `OWNER` before the snapshot. Export route returns 403 without the flag. Export auth list is `OWNER` and `MANAGER`, but the flag still blocks non-Pro.
- Snapshot calls `getTodayKPIs`, `getOwnerBrief`, `getCashflowForecast`, and its own yesterday comparisons using **server-local** `startOfDay` / `endOfDay`.
- Overview cards: sales, gross profit, transactions, cash in till, debtors, payables due, low stock.
- Cash in till prefers the sum of open-shift `expectedCashPence`, else Today KPI `paymentSplit.CASH`.
- Yesterday cash trend sums `SalesPayment` method `CASH` where the **parent invoice** is not `RETURNED`/`VOID`. It does **not** require `status = CONFIRMED`. That contradicts Money Received.
- Health score (`lib/reports/health-score.ts`): five dimensions, 20 points each. No sales → margin treated as on-target. No operating expenses → cash days assumed 30 if cash &gt; 0, else 15. No tracked reorder products → inventory dimension is neutral.
- 14-day money-pulse bars. Mobile-only `MobileTopThree` (`lg:hidden`).
- Cache: 60s. No store argument from `OwnerDashboardBody` → all branches.
- Export: `/reports/owner/export?format=csv|html`. Summary counts, not the product margin rows.
- Confidence: **Med**. It composes other engines and adds a non-canonical cash query. Health score is a presentation score, not a reconciled total.
- Duplicate candidate: Command Center, Trading Report, Cashflow Forecast, margin leakage.

### 3.23 Audit Log — `/reports/audit-log`

- File: `app/(protected)/reports/audit-log/page.tsx`.
- Question: what sensitive actions were recorded?
- Gate: `auditLog` (Pro) and role `OWNER`.
- Lists `AuditLog` rows. Filters are action and user, not a date range. No branch filter. No export.
- Confidence: **High** as a list of stored audit rows. It is a control record, not a financial calculation.
- Duplicate candidate: none.

### 3.24 Exports hub — `/reports/exports`

- File: `app/(protected)/reports/exports/page.tsx`.
- Question: which file should I download?
- Roles: `MANAGER`, `OWNER`. Plan: the page always renders. Only the Risk Summary buttons check `features.riskMonitor`.
- Default period for dated exports: `30d` via `resolveSelectableReportDateRange`.
- Buttons and gates are in §6. There is no row cap on this page.

### 3.25 Sales history — `/sales`

- File: `app/(protected)/sales/page.tsx`.
- Question: which sale invoices exist?
- Roles: `MANAGER`, `OWNER`. Plan: none.
- Default `from` and `to` are today. `storeId` defaults to `ALL`.
- This is the invoice list, not a second sales total. Trading Report links here.
- `/reports/sales` only `redirect('/reports/dashboard')`.
- Confidence: **High** as a record list.
- Duplicate candidate: source drill-down for sales activity.

### 3.26 What customers owe — `/payments/customer-receipts`

- File: `app/(protected)/payments/customer-receipts/page.tsx`.
- Question: which customer balances are open, and how do I record a receipt?
- Roles: `requireBusinessAndOptionalStore(['MANAGER', 'OWNER'])`. Plan: none. Export: none on this page. Statement export is per customer (§6).
- Operational store required. No report date filter.
- Balance math used widely: `computeOutstandingBalance` in `lib/reports/operational-metrics.ts` = `max(totalPence − Σ payment.amountPence, 0)` with **no payment-status filter**. `getSalesRevenueSummary` credit outstanding **does** exclude `FAILED`/`CANCELLED`/`VOID` payments.
- Confidence: **Med** because the two outstanding helpers disagree on payment status.
- Duplicate candidate: Trading Report debtor ageing, Today KPI AR (90-day createdAt floor).

### 3.27 Supplier ageing — `/payments/supplier-aging`

- Files: page, `lib/services/supplier-aging.ts`, export route.
- Question: how much is unpaid to suppliers, by ageing bucket, as of a date?
- Roles: `MANAGER`, `OWNER`. Plan: none.
- As-of defaults to today, interpreted as UTC midnight. Buckets include `DUE_DATE_MISSING`, `NOT_YET_DUE`, 1–30, 31–60, 61–90, over 90.
- This is purchase-invoice outstanding, not preferred-supplier sales.
- Export: `/payments/supplier-aging/export`. No plan check.
- Confidence: **High** that buckets exist and missing due dates are explicit. **Med** on timezone (UTC as-of versus business-local “today” elsewhere).
- Duplicate candidate: Today KPI AP (90-day floor, no missing-due-date bucket), Trading Report “what you owe suppliers”, Sales by Linked Supplier (different question).

### 3.28 Supplier payments — `/payments/supplier-payments`

- File: `app/(protected)/payments/supplier-payments/page.tsx`.
- Question: how do I pay a supplier invoice?
- Roles: `MANAGER`, `OWNER` plus operational store. Plan: none. Export: none.
- This is a workflow screen linked from the catalogue, not a second AP total.
- Confidence: **High** as a workflow. Not a calculation surface beyond the open invoices it lists.

### 3.29 Nav today sales (not a page)

- `getNavTodaySales` in `app/actions/nav-kpis.ts` allows `CASHIER`, `MANAGER`, `OWNER` and returns today’s revenue and transaction count from `getHomePerformanceSummary` (all branches).
- `components/TopNav.tsx` loads it when the mobile menu opens, on focus, and after a POS sale.
- Cashiers do not get gross profit here. They do get business-wide today sales.
- Confidence: **High**.

---

## 4. Distinct calculations (18)

| # | Engine | Primary code | Used by |
|---|---|---|---|
| 1 | Recognised sales | `lib/reports/sales-revenue.ts` | Home, Trading Report, Business Movement headline |
| 2 | Confirmed money received | `lib/reports/money-received/*` | Money Received, Trading Report receipts, Weekly Digest payment split, parts of Today KPIs |
| 3 | Line gross profit with default-cost fallback | Trading dashboard, `today-kpis.ts`, `financials.ts`, Analytics | Trading, Command Center, income statement, analytics |
| 4 | Margin snapshot (also drops `salesReturn`) | `lib/reports/margin-analysis.ts` | Profit Margins, owner leakage counts |
| 5 | Stored `grossMarginPence` | `lib/reports/weekly-digest.ts` | Weekly Digest headline only |
| 6 | Top-margin `/100` estimator | `weekly-digest.ts` lines 147–155 | Weekly Digest top margin only |
| 7 | Indirect cashflow and GL balances | `lib/reports/financials.ts` | Cashflow, balance sheet, income journals |
| 8 | Cash forecast | `lib/reports/forecast.ts` | Cashflow Forecast, Owner Brief |
| 9 | Shift expected vs counted and drawer entries | cash-drawer page, `lib/services/cash-drawer.ts` | Cash Drawer, exports eod |
| 10 | Open-shift expected cash sum | `lib/reports/home-expected-cash.ts` | Owner Home. Also preferred by Owner Brief |
| 11 | AR outstanding / ageing | `operational-metrics.ts`, Trading Report, customer receipts | Several debtor surfaces. Payment-status filter is not shared |
| 12 | AP outstanding / ageing | `lib/services/supplier-aging.ts`, supplier KPIs, Today KPIs | Ageing page vs 90-day KPI slice |
| 13 | Expense journals vs paid `Expense` rows | `financials.ts` vs `today-kpis.ts` / forecast | Income statement vs “expenses paid” |
| 14 | Stock movement ledger | stock-movements page | List only |
| 15 | Reorder velocity | reorder page | Growth page only |
| 16 | On-hand vs reorder point | `summarizeInventoryRisk` | Today KPIs, Trading low stock |
| 17 | Preferred-supplier sales | `lib/reports/supplier-sales.ts` | Sales by Linked Supplier |
| 18 | Period comparison bundle | `lib/reports/business-movement/*` plus Weekly Digest previous week | Two comparison products, both ungated |

Health score (`lib/reports/health-score.ts`) and alert rules (`lib/reports/alerts.ts`) are scorers over inputs. They are not counted as a 19th source calculation. Risk alerts are stored `RiskAlert` rows written by `lib/services/risk-monitor.ts`.

---

## 5. Dashboard and chart surfaces

| Surface | Metrics / charts | Plan in code |
|---|---|---|
| Owner Home hero | Sales or product count, transactions, expected cash | All plans |
| Owner Home attention | Up to several actions, not capped at 3 | Reorder hidden unless Growth |
| Command Center strip | Sales, GP%, receipts, debtors, issue count | All plans, including GP% |
| Trading Report | 6 KPI cards, method bars, activity counts, debtor buckets, low stock, best sellers | All plans, including GP and net profit |
| Owner Brief | 7 cards, 14-day bars, health score, mobile top three | Pro, owner |
| Business Movement | Period deltas, product / branch / cashier tables | All plans |
| Weekly Digest | Week vs previous week, top sellers, top margin, cashier tables | All plans |
| Analytics | Trend and top products vs previous window | Growth page gate |

No chart library was found on these pages. “Charts” are tables, stat cards, or CSS bars.

---

## 6. Downloads, APIs, and schedules

Auth shorthand: export routes use `requireExportUser` (`app/(protected)/exports/_shared.ts`) — session role `MANAGER` or `OWNER`, otherwise redirect to `/login`. They do not receive the reports layout gate.

| Endpoint | File | Plan check | Cost or margin columns | Row cap |
|---|---|---|---|---|
| `GET /exports/sales` | `app/(protected)/exports/sales/route.ts` | **None** | **Cost and Margin** on every line. Cost = `lineCostPence` if `> 0` else default × qty | None |
| `GET /exports/purchases` | `exports/purchases/route.ts` | None | Unit cost, not margin | None |
| `GET /exports/inventory` | `exports/inventory/route.ts` | None | **Avg cost**. Query uses the **first store only** (`findFirst`) | None |
| `GET /exports/products` | `exports/products/route.ts` | None | **Default cost** | None |
| `GET /exports/reversals` | `exports/reversals/route.ts` | None | Refund amount | None |
| `GET /exports/margins` | `exports/margins/route.ts` | **None** | Avg sell, avg cost, revenue, cost, profit, margin %, target % | None |
| `GET /exports/eod-csv` and `/exports/eod-pdf` | `exports/eod-csv`, `exports/eod-pdf` | None | Drawer breakdown, not product margin | None |
| `GET /exports/risk-summary` | `exports/risk-summary/route.ts` | Growth `riskMonitor` | Discount totals, not COGS | None |
| `GET /exports/money-received` | `exports/money-received/route.ts` | None (role, tenant, branch) | Receipt amounts, no product margin | Pages of 500, no total cap |
| `GET /exports/business-movement` | `exports/business-movement/route.ts` | None (role, tenant, branch) | Sales vs money, product movers, **branch and cashier** | Complete stream |
| `GET /exports/momo-confirmation` | `exports/momo-confirmation/route.ts` | None | Amounts | Pages of 500 |
| `GET /api/reports/financials` | `app/api/reports/financials/route.ts` | Growth `financialReports` | Statement lines including GP, COGS, net profit | Summary rows only |
| `GET /api/reports/weekly-digest` | `app/api/reports/weekly-digest/route.ts` | **None** | GP, GP%, top margin, cashier performance | Top lists capped at 5 in the builder |
| `GET /api/exports/pack` | `app/api/exports/pack/route.ts` | **None** | ZIP: sales ledger (invoice level, **no** line cost), purchases, VAT, debtors, stock movements (`lib/exports/csv-writers.ts`) | None. Default last 30 days |
| `GET /reports/sales-by-supplier/export` | sales-by-supplier export | Growth `advancedReports` | Revenue, no unit margin | None |
| `GET /reports/owner/export` | owner export | Pro `ownerIntelligence` | Summary counts, leakage counts | Not the underlying invoice lines |
| `GET /customers/[id]/statement` | `app/(protected)/customers/[id]/statement/route.ts` | None | Invoice, date, status, total, paid, balance | None |
| `GET /suppliers/[id]/statement` | `app/(protected)/suppliers/[id]/statement/route.ts` | None | Same shape for purchases | None |
| `GET /payments/supplier-aging/export` | supplier-aging export | None | Ageing buckets or invoice detail | None |
| `GET /api/debug-financials` | `app/api/debug-financials/route.ts` | **None**. Role `MANAGER`/`OWNER` | JSON GL diagnostic, not a file | n/a |

`GET /api/exports/labels` is label print (HTML/ZPL), capped at 200 products, any authenticated role. It is not a financial report.

`app/(protected)/exports/export-pack/page.tsx` links to `/exports/sales-pdf`, `/exports/purchases-pdf`, `/exports/debtors`, `/exports/debtors-pdf`, and `/exports/inventory-movements`. No matching `route.ts` files were found. Live buttons on `/reports/exports` use the routes in the table above.

Scheduled: `GET /api/cron/eod-summary` requires `CRON_SECRET`. It enqueues `enqueueOwnerDailySummarySms` for businesses with `whatsappEnabled` (unless `force=1`), not demo, `subscriptionStatus != CANCELLED`. **No plan check.** Payload includes sales, gross profit, payment split, debtors, and alerts (`lib/notifications/owner-daily-summary-sms.ts`). Settings UI and `POST /api/notifications/preview` require Growth.

There is no scheduled CSV, no in-app schedule record, and no saved analytical view model in the report code that was searched.

---

## 7. Permissions as enforced

| Surface | OWNER | MANAGER | CASHIER |
|---|---|---|---|
| All `/reports/*` pages | Yes, subject to page gates | Yes, except Owner Brief, Cashflow Forecast, Audit Log | No (layout) |
| Profit / margin screens | Yes | Yes on Trading, Command Center, Weekly Digest. Margins and Analytics pages are Growth-gated but not permission-gated | No |
| Supplier debt | Yes | Yes (ageing, payments, Trading AP card, Today KPIs) | No via reports layout |
| Branch comparison | Yes | Yes, on Business Movement, no extra flag | No |
| Staff / cashier tables | Yes | Yes (Weekly Digest, Risk Monitor, Business Movement) | No |
| Audit log | Pro only | No | No |
| Owner Brief, forecast | Pro only | No | No |
| `/shifts/drawer` | Yes | Yes | **Yes** (no role array) |
| Nav today sales | Yes | Yes | **Yes**, business-wide |
| Money Received export | Yes | Yes | Denied (`money-received-access.test.ts`) |
| Statement and ageing exports | Yes | Yes | Not via `getUser` role check on those routes |

Staff tables that exist today: Weekly Digest “Cashier Performance” and “Risk Trends”; Risk Monitor “Cashier Trends”; Business Movement “Cashier movement”. None include hours, shift count, or average basket. Business Movement and Weekly Digest sort or rank from sales value. No on-screen warning that the table is not evidence of theft. Risk Monitor uses the words “anti-fraud”.

Searches of report UI found no “theft”, “suspicious”, or “leaderboard” strings. “Theft” exists as a stock-adjustment reason outside reports.

---

## 8. Duplication and contradictions

### 8.1 Payment-method sales vs money received

- Canonical money received is confirmed payments at `receivedAt` (engine 2). Trading Report uses it and tells the reader it is not sales.
- Command Center “today’s receipts” calls the same aggregate with a **server-local day** and `Africa/Accra`, so it can disagree with Trading Report “today” when `Business.timezone` differs or when the server is not in Accra.
- Owner Brief yesterday cash sums cash payments whose **invoice** is not returned/void, without `CONFIRMED`.
- Cashflow Forecast’s trailing “cash sales” uses the same invoice-status filter and no `CONFIRMED` filter.
- Cash Drawer is a third number: shift `expectedCashPence` / `actualCashPence` and `CashDrawerEntry` types.

### 8.2 Sales revenue vs cash movement

- Sales = invoice `totalPence` at `createdAt`, including unpaid credit (`sales-revenue.ts`).
- Money received = confirmed `amountPence` at `receivedAt`, including later collections and excluding unconfirmed MoMo.
- Business Movement stores the gap as leakage.
- Trading Report net profit and the cashflow statement do not use this gap. They use journals.

### 8.3 Gross profit vs margin performance

Engines 3, 4, 5, and 6 can produce different GP for the same shop on the same day. Income statement can show an incomplete-stock warning while Trading Report and Command Center show a firm percentage. Margin Analysis drops returned-invoice lines that Analytics still includes, and the two pages do not share a clock.

### 8.4 Product performance

| Surface | Amount field | Plan gate |
|---|---|---|
| Analytics top products | `lineSubtotalPence` | Growth page |
| Margin rows | `lineSubtotalPence` | Growth page; export open |
| Business Movement movers | `lineTotalPence` | None |
| Weekly Digest top sellers | `lineTotalPence` | None |
| Sales by Linked Supplier | `lineTotalPence` | Growth page and export |
| Trading best sellers | line aggregates in the trading snapshot | None |

`lineTotalPence` includes charges that `lineSubtotalPence` excludes. These are not the same product ranking.

### 8.5 Customer receipts vs credit collections

- Money Received classifies `receiptOrigin = LATER_CREDIT_COLLECTION` separately from money taken at sale.
- Customer receipts is the screen that records those collections.
- Trading Report “credit sales (unpaid)” is only the unpaid part of **in-period** invoices.
- Today KPIs outstanding AR is open invoices **created in the last 90 days**, any age bucket inside that slice.
- `computeOutstandingBalance` ignores payment status; `getSalesRevenueSummary` does not.

### 8.6 Supplier balances vs supplier ageing

- Supplier ageing is the open-invoice bucket report, including missing due dates, as of a UTC day. It includes invoices older than 90 days.
- Today KPIs / Command Center “outstanding” AP only includes purchase invoices created in the last 90 days.
- Trading Report supplier card uses the trading snapshot’s open purchases (not the 90-day helper).
- Sales by Linked Supplier is preferred-supplier **revenue**, and the page says so.

### 8.7 Cash drawer vs shift reconciliation

- Cash Drawer is the period report of expected, counted, and variance on closed shifts, plus entry types.
- Today KPIs add **absolute** variance for 7 days, capped at 200 shifts, on the server-local clock.
- Trading Report shows a variance sample (`take: 100`) inside the reporting-scope window.
- Risk Monitor creates alerts when detectors fire. It is not the drawer total.
- Owner Home shows expected cash for **open** shifts only, and 0 when none are open. It does not show counted cash.

### 8.8 Stock movement vs adjustments

- Stock Movements lists `StockMovement`, including adjustment and transfer types. No total.
- Weekly Digest counts `StockAdjustment` rows.
- Risk detectors raise `LARGE_INVENTORY_ADJUSTMENT` from the adjustment service.
- Business Movement refuses to emit stock insights (`NOT_RELIABLE`).

---

## 9. Leaks

“Leak” here means the code does not enforce the gate the screen implies, or a higher-plan idea is computed for every plan. This section does not decide the future contract.

### 9.1 Server-side tier leaks (screen hidden or plan-labelled, API still open)

| Item | Screen | Endpoint |
|---|---|---|
| Profit Margins file | Growth notice before data | `GET /exports/margins` has **no** plan check |
| Line cost and margin on the sales file | Margin **page** is Growth. The Exports hub is not, and it links `/exports/sales` on every plan | `GET /exports/sales` always writes Cost and Margin |
| Daily owner summary | Settings and preview require Growth | Cron enqueue has **no** plan check, and the SMS includes gross profit |

These are not leaks (screen and endpoint agree):

- `/api/reports/financials` and the three statement pages (Growth).
- `/exports/risk-summary` and Risk Monitor (Growth).
- `/reports/sales-by-supplier/export` and its page (Growth).
- `/reports/owner/export` and Owner Brief (Pro).

### 9.2 Tier gaps where screen and export are both open

These are not “UI hidden, API open”. Both sides are open to Starter `MANAGER`/`OWNER`:

- Business Movement branch table and CSV (multi-branch comparison).
- Business Movement cashier table and CSV.
- Weekly Digest previous-week comparison, GP, top margin, and cashier tables, including CSV.
- Trading Report gross profit and net profit with no data-quality state.
- Command Center gross margin percent.
- Custom date ranges on Trading Report, margins presets through 365 days and custom, and export date pickers. No 30-day or 13-month cap exists.
- Export pack ZIP, including debtors and stock movements, with no plan check.
- `GET /api/debug-financials` with no plan check.

Reports hub badges do not stop a Starter user opening a Growth card. Gated **pages** then show `AdvancedModeNotice` and do not load the snapshot. Ungated pages load the numbers.

### 9.3 Permission leaks

- Any manager sees profit, supplier balances, all-branch totals, and cashier sales tables. There is no separate grant.
- A cashier can open `/shifts/drawer`.
- A cashier can see business-wide today sales and transaction count in the nav.
- Risk Monitor describes cashier alerts as anti-fraud. That is a copy fact, not a detector name.

### 9.4 Export leaks (screen entitlement ≠ file entitlement)

Only `/exports/margins` is a hard mismatch: the page refuses to render and the file route does not. `/exports/sales` is a column mismatch: the file adds Cost and Margin on a route the Exports hub offers to every plan, while the dedicated margin report is Growth-only.

Inventory export is also factually wrong for multi-store businesses: it reads the first store only, with no plan or store parameter.

---

## 10. Mostly zeros, placeholders, and technical noise

| Item | Behaviour |
|---|---|
| Business Movement stock | `stockInsightsEmitted: false`, readiness `NOT_RELIABLE`. Not a stock report |
| Money Received gated metrics | `valuePence: null`, quality “unavailable until dependency resolved” |
| Money leakage on query failure | Facts set to 0 with `queryFailed: true`. A UI that ignores the flag shows a fake zero |
| Owner Home expected cash | 0 when no shift is open |
| Health score | Neutral stand-ins when there are no sales, no expenses, or no reorder points |
| Cash Drawer header | Expected/counted ignore still-open shifts, so the header can be 0 while tills are open |
| Command Center GP subtitle | “No cost data” when KPIs are null, not when cost is missing |
| Dead export-pack links | Five hrefs with no route (§6) |
| `/reports/sales` | Redirect only |
| Today KPI AR/AP | Silent omission of invoices older than 90 days, which can look like a true zero or a low balance |
| Liquid assets | GL cash used whenever the GL balance is `> 0`, even if the operational estimate differs. Null only when the fallback query fails |

---

## 11. Missing owner-critical reports (not in the product today)

Judged only by absence in routes and nav, against the questions an owner would ask. This is not a build list.

| Question | What exists | What does not |
|---|---|---|
| Is today’s cash honest (expected vs counted)? | Cash Drawer report. Home shows expected only | No expected-vs-counted on Owner Home. No sync warning |
| Who owes me, including old invoices? | Supplier ageing (every open purchase invoice) and customer receipts | Command Center AR/AP drop invoices older than 90 days. No customer ageing report under `/reports` |
| Which due dates are missing? | Supplier ageing bucket `DUE_DATE_MISSING` | Not an Owner Home action |
| How did staff actually work? | Sales-ranked cashier tables | No hours, shifts, basket, or variance-first staff report |
| How do branches compare? | Business Movement branch table, ungated | No Pro-only branch report. No consolidated AR/AP report |
| What stock moved between branches? | `TRANSFER_IN` / `TRANSFER_OUT` rows inside Stock Movements | No transfer report |
| Did gross profit use complete costs? | Income statement warning only | Trading, Command Center, Weekly Digest, and Analytics do not use Ready / Incomplete / Hidden |
| What is waiting to sync? | Nothing on report surfaces | No report sync state |

---

## 12. Mobile and performance notes

- Separate mobile UI that still uses the same server payload: Owner Brief `MobileTopThree`; Cash Drawer `lg:hidden` ledger; Receipt transactions card list; several filter blocks behind `details-mobile`.
- Owner phone nav does not list most reports. Owners on a phone are pointed at `/onboarding`, `/reports`, `/reports/owner` (Pro), `/reports/analytics` (Growth), cash drawer, and stock movements.
- Heaviest cached readers: Trading Report (60s, many parallel aggregates), Owner Brief (60s, composes forecast + KPIs), Today KPIs (30s, wide fan-out), Weekly Digest (1 hour, loads all lines for the week into memory for top sellers).
- Unbounded `findMany` on `/exports/sales`, purchases, reversals, margins, pack writers, and statements. No pagination.
- Inventory export silently ignores every store after the first.
- Report routes are disallowed for crawlers in `app/robots.ts`.

---

## 13. Confidence roll-up

| Confidence | Calculations |
|---|---|
| High | Recognised sales on the reporting-scope clock; Money Received confirmed definition and access checks; cash-drawer entry sums; reorder arithmetic; supplier-ageing bucket set; stock-movement list; audit list |
| Med | Income statement, balance sheet, indirect cashflow; Today KPIs; Owner Brief composite; Analytics; Trading Report GP; AR payment-status split; supplier ageing timezone; forecast inputs; product `lineTotal` vs `lineSubtotal` |
| Low | Weekly Digest stored GP and top-margin `/100` formula; any server-local report when the server timezone is not the business timezone; Business Movement presented as branch truth on non-Pro; Command Center receipts vs Trading Report today |

---

## 14. Pass A close

Surfaces found: **49**. Distinct calculations found: **18**.

The same business questions are answered by more than one engine for sales vs receipts, gross profit, product rank, debtor balances, supplier balances, cash variance, and stock adjustments. Those are recorded in §8 so Pass B can retire or deep-link them. This file does not choose the future catalogue.
