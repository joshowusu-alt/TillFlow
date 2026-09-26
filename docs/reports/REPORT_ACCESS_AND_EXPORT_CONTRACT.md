# Report access and export contract

Status: formula and balance amendment applied (2026-09-23). Not implemented. No schema and no permission UI in this close-out.

Covers permissions, files, empty states, downgrade, freshness, reconciliation, metric versions, and the entitlement test matrix. Plan numbers are in `PLAN_ENTITLEMENT_MATRIX.md`. Families are in `REPORT_CATALOGUE.md`.

Roles that exist today: `OWNER`, `MANAGER`, `CASHIER`. No finer permission flags exist (Pass A §7). This contract freezes five explicit grants. Tier and grant are separate. A Pro cashier still cannot open staff activity. A Starter owner still cannot open branch comparison.

---

## E. Permissions

### Grant names

Plan eligibility is checked first. The grant is checked second. A grant never bypasses a plan. Owners receive the grants their plan allows. A new manager receives none of the five. Only an authorised owner can grant or revoke. A manager cannot self-elevate. Every grant, revoke, confirmation, and expiry is audited.

Future permission UI is one settings surface under Staff/Permissions. No Reports chrome, no marketing cards, and no wider settings redesign. This close-out does not add that screen or a schema.

| Grant | Surfaces it controls |
|---|---|
| `VIEW_MARGIN` | Trading Report GP and net profit, Command Center GP%, Weekly Digest GP and top margin, Profit Margins, income-statement GP, Owner Brief GP, `/exports/margins`, the Margin column on `/exports/sales`, and GP on the Growth SMS |
| `VIEW_SUPPLIER_DEBT` | Supplier ageing, supplier statement, ageing export, supplier payment balances, Trading Report supplier card, Today KPI supplier balance, Owner Today widget 6, Growth SMS overdue supplier total |
| `VIEW_STAFF_ACTIVITY` | Weekly Digest cashier tables, Risk Monitor cashier table, Business Movement cashier table, and those sections of their files |
| `VIEW_COMPANY_PERFORMANCE` | A Pro all-store total: Owner Home “all branches”, Command Center with no store, Weekly Digest business-wide, consolidated statement totals. Unused on Starter and Growth because only one store is operational |
| `VIEW_BRANCH_COMPARISON` | Business Movement branch table and the branch section of its CSV, and any later `branch_performance` screen. Pro only |

Today those surfaces use `MANAGER` or `OWNER` plus a plan flag. They do not use these grants (Pass A §7).

Manager defaults for non-sensitive families stay on: `sales_activity`, `payment_flow`, `cash_reconciliation`, `expense_activity`, `inventory_position`, `stock_movement`, `purchase_activity`, `customer_receivables`. Audit log stays owner and Pro. `owner_today` shows only the families that manager can see.

### Existing managers (`LEGACY_ACCESS`)

Current sensitive access becomes an explicit `LEGACY_ACCESS` grant. The owner gets an in-app review notice on the future Staff/Permissions surface.

- The owner may confirm or revoke each grant.
- The transition is 30 calendar days in `Business.timezone`, counting the local start date as day 1.
- On day 31 an unconfirmed grant fails on the server. Denial does not wait for a cleanup cron.
- Confirmation, revocation, and automatic expiry are audited.
- A plan downgrade defeats a grant the new plan does not allow.
- A later upgrade does not turn an unconfirmed or expired legacy grant back on.

### Cashier scope

A cashier may see only the operational information for their authorised active shift, their assigned till, and their selected authorised store.

A cashier must not see business-wide sales, Owner Today, any `/reports/*` page, a report export, profit or margin, supplier debt, staff activity, a company-wide drawer reconciliation, another cashier’s shift, another till, or another store.

If a cashier needs a drawer route, the server allows it only when the shift is that cashier’s active shift and the till and store match. A deep link or a changed identifier that fails those checks is denied. Hiding a nav link is not the control. `/shifts/drawer` does not do this today (Pass A §3.17). Nav today sales is business-wide today (Pass A §3.29).

### Family access

| ID | Owner | Manager | Cashier | Plan note |
|---|---|---|---|---|
| `sales_activity` | Yes | Default on | No | Records all plans. Trends follow the matrix |
| `payment_flow` | Yes | Default on | No | Records all plans |
| `cash_reconciliation` | Yes | Default on | Own active shift, till, and store only | Company-wide drawer report stays manager/owner. Cashier deep links that fail the scope check are denied |
| `expense_activity` | Yes | Default on | No | All plans |
| `inventory_position` | Yes | Default on | No | Position all plans. Velocity list Growth+ |
| `stock_movement` | Yes | Default on | No | Ledger all plans |
| `purchase_activity` | Yes | Default on | No | All plans |
| `customer_receivables` | Yes | Default on | No | All plans |
| `supplier_payables` | Yes | `VIEW_SUPPLIER_DEBT` | No | All plans once granted |
| `margin_performance` | Yes | `VIEW_MARGIN` | No | Quality-state figure all plans. Rankings and trends Growth+ |
| `variance_signals` | Yes | Default on for signals in families they can already open. Staff clustering needs `VIEW_STAFF_ACTIVITY` | No | Signal list is Growth+. The source shift or void row stays a record |
| `staff_activity` | Yes | `VIEW_STAFF_ACTIVITY` | No | Not Starter |
| `branch_performance` | Yes | `VIEW_BRANCH_COMPARISON` and `VIEW_COMPANY_PERFORMANCE` | No | Pro only |
| `owner_today` | Yes | Partial | No | All plans |
| `owner_daily_summary` | Yes, when the plan allows the send | No | No | Starter: denied. Growth: one daily SMS to one verified owner destination. Pro: may receive the daily summary under the applicable Pro schedule entitlement. WhatsApp is not implemented. This row is not `management_pack` |
| `management_pack` | Yes | No, unless the owner adds them as a Pro pack recipient | No | Pro file and schedule product only. Growth does not receive a management pack. Waves A–C do not build the pack experience |
| Audit log | Yes | No | No | Pro |
| Forecast | Yes | No | No | Pro |

### Compiled financial statements

Starter retains all underlying sales, expense, payment, stock, receivable and payable records for every retained date. Starter receives the truthful GP view with cost-quality handling. Starter does not receive the compiled Income Statement, Balance Sheet or Cashflow Statement screens. Growth receives single-store financial statements. Pro receives eligible multi-store and consolidated financial statements. Supplier-debt and margin fields inside statements still require the relevant staff permission. Restricting a compiled statement must never restrict access to its underlying source records.

`GET /api/reports/financials` (S41) is a delivery of those compiled statements and uses the same plan and permission decision as the screens. It is not a Starter record export.

### Staff activity

Not a score. Not a rank of who sold the most. Default sort:

1. Unresolved cash variance (absolute pesewas, unreviewed shifts) descending
2. Void and return rate = (void count + return count) / transaction count descending
3. Transaction count descending

Sales processed is a column. It is not the default sort and it is not a “top cashier” heading.

Columns, all of them, or the column says **Not recorded**:

| Column | Formula |
|---|---|
| Sales processed | Σ `sales_activity` invoice totals whose cashier is this user, same status filter as the family |
| Shifts | Count of shifts they opened in the window |
| Hours | Sum of closed-shift duration. If the clock was not stored: **Hours not recorded**, and shifts still show |
| Transactions | Invoice count in the sales set |
| Average basket | Sales processed / transactions. Blank if transactions are 0 |
| Discounts | Σ discount pesewas, and count of discount overrides |
| Voids | Count and value of void documents they rang |
| Returns | Count and value of `SalesReturn` type `RETURN` on their sales |
| Cash variances | Signed sum of `cash.variance.v1` on their closed shifts, and the count of non-zero variances |
| Unresolved variances | Count of those variances not marked reviewed |

On-screen warning, shown above the table whenever the table is shown:

> These figures describe till activity and shift differences. They are not a finding of theft, fraud, or poor character. Open the source sales, voids, and shift records before you decide what happened.

Every count links to the source rows. There is no column for suspicion, fraud, or character.

### Variance signal language

Only these labels, each linking to source transactions or stock documents:

- Cash variance
- Stocktake difference
- Unusual void activity
- High adjustment value
- Repeated discounts
- Unresolved shift difference
- Requires review

Do not write anti-fraud, theft detection, suspicious employee, or proof of wrongdoing. Risk Monitor uses “anti-fraud” today (Pass A §3.21). That copy does not survive this contract. A signal is evidence that requires review. It is not an accusation.

---

## F. CSV and export scope

One server function authorises the screen, the file, the PDF, the schedule, the deep link, and any future share. Name to implement later: `assertReportEntitlement`. This document does not add it. Routes must not grow a second, weaker check.

Own-records file vs management pack:

| | Own-records CSV | Management pack |
|---|---|---|
| Who | Every plan, with the row’s permission | Pro only. Not `owner_daily_summary`. Growth has no management pack |
| What | Source rows the business already stored | A composed file: comparison, rankings, branch pages, narrative totals |
| Margin math columns | Only with `VIEW_MARGIN` | Only with `VIEW_MARGIN` |
| Date | Any stored date on Starter for **rows**. Growth analytical packs stay inside 13 months. Pro packs stay inside retained history | Same as the viewer’s analytics window |

### Own-records entities

| Entity | Starter columns | Growth and Pro extra |
|---|---|---|
| Sales lines | Invoice, date, store, customer, product, SKU, qty, unit, unit price, discount, subtotal, VAT, total, **stored line cost** | Computed margin and margin % only with `VIEW_MARGIN` and only in state Ready. Incomplete lines omit the margin cell and set a cost-state column |
| Sales invoices | The pack ledger columns already in `buildSalesLedgerCsv` (no line cost) | No change |
| Payments | Method, status, received time, amount, origin, invoice ref | None |
| Expenses | Date, category, amount, paid state, store | None |
| Stock movements | Product, type, qty, store, time, reference | Value column is a record if a value was stored on the row. Do not invent a margin |
| Inventory on hand | Product, store, qty, stored average cost, stored default cost | No computed margin |
| Products | Name, SKU, price, stored default cost | None |
| Purchase lines | Supplier, date, product, qty, unit cost, totals, paid, balance | None |
| Customer invoices / statement | As `/customers/[id]/statement` today | None |
| Supplier invoices / statement and ageing | As the supplier statement and ageing export today | 30/60/90 **summary page** is Growth+ analytics. The invoice rows are all-plan records |
| Returns and voids | As `/exports/reversals` | None |
| Shifts and drawer entries | Expected, counted, variance, entry type, amount | None |

`GET /exports/sales` currently always emits Cost and Margin for every plan (Pass A §6). Under this contract the Margin column is removed unless `VIEW_MARGIN` is on and `margin.line.v1` is Ready for that line. Stored cost stays.

`GET /exports/margins` becomes the analytical margin file: Growth or Pro, `VIEW_MARGIN`, inside the plan’s analytics window, same gate as the screen.

`GET /exports/inventory` must cover every store the viewer is entitled to. The first-store-only query is not allowed.

`GET /api/exports/pack` is an own-records ZIP (sales ledger, purchases, VAT, debtors, stock movements) on every plan. It is not a management pack. It must not gain branch comparison or cashier ranking pages.

Export transport:

Owned records are not cut short by plan entitlement or by a silent row limit. Analytical windows stay the plan windows in the table below. A large own-records export must stream, paginate, chunk, or provide an explicit continuation. Application memory must not scale with the entire retained history. If a transport limit is reached, the response is an explicit continuation or an explicit error. It is not a partial file labelled complete. Cross-tenant and store-scope checks apply to every chunk.

Waves A–C do not build a new background-export product unless that is required to stop an existing endpoint from loading an unsafe history into memory. Streaming or bounded chunking is the preferred transport.

| Plan | Own-records file | Analytical file or pack |
|---|---|---|
| Starter | No entitlement truncation and no silent truncation. Date filter optional. Transport rules above | 30 local days, and only the two trend series. No margin ranking file |
| Growth | No entitlement truncation and no silent truncation. Transport rules above | 13 months |
| Pro | No entitlement truncation and no silent truncation. Transport rules above | Retained history |

No file may return 200 with another tenant’s `businessId`. Money Received already enforces tenant and branch (`resolveMoneyReceivedAccess`). The shared entitlement function must do that for every chunk, not only the first page.

PDF and HTML print use the same check as CSV. The Owner Brief screen is owner-only (`requireBusiness(['OWNER'])` in `app/(protected)/reports/owner/page.tsx`). The current export route admits managers (`requireBusiness(['OWNER', 'MANAGER'])` in `app/(protected)/reports/owner/export/route.ts`) and then checks only `ownerIntelligence`. Screen and export must use the same entitlement and permission decision. A manager denied the screen must be denied the direct export. That mismatch is known-red B13. It is not a green pair.

Share: there is no per-report share control today. Any later share uses the same function. `owner_daily_summary` is one SMS to an explicitly verified SMS-capable phone. The cron route must call the same plan check the settings page uses. WhatsApp is not implemented. Do not add a WhatsApp provider, route, UI, copy, or test stub.

`GET /api/debug-financials` is outside the 49. It is not development-only and it is not fail-closed. Classification and the required negative test are in the out-of-49 appendix and known-red B12. It does not inherit the compiled-statement plan boundary by remaining open to every manager.

---

## G. Empty and unavailable states

Use one pattern for plan locks on analytics: **More insights with Growth** or **More insights with Pro**, on the analytical control that was refused. Do not put padlocks on sales totals, balances, stock on hand, or expected cash.

| State | When | What the user sees |
|---|---|---|
| Shown | Entitled, and the query succeeded | The figure or the rows |
| Not set up yet | The business has no products, no till, or no opening stock, and the widget needs that setup | **Not set up yet** and the existing setup link |
| Hidden, feature irrelevant | Transfers on Starter or Growth; branch comparison when the plan is not Pro; a second store | The block is absent. Not a locked card |
| Locked, plan | Starter opens a comparison, a staff table, a schedule, or a 13-month trend | **More insights with Growth** or **More insights with Pro**. Records on the same page stay visible |
| Unavailable, permission | Manager lacks `VIEW_MARGIN`, `VIEW_SUPPLIER_DEBT`, `VIEW_STAFF_ACTIVITY`, `VIEW_BRANCH_COMPARISON`, or `VIEW_COMPANY_PERFORMANCE` | **You don’t have access to this report.** No numbers, including zeroes |
| Blocked, data | Margin state `INCOMPLETE_COSTS`; receipt query failed; open-shift expected cash while relevant data may be unsynced | The freshness sentence or the catalogue state. Not All synced, not Syncing N, and not a substituted zero |
| Empty, real zero | Query succeeded and the sum is zero | The empty copy from `OWNER_TODAY_CONTRACT.md` or **No rows in this period** |

---

## H. Downgrade, freshness, reconciliation, versions

### Downgrade

Pro → Growth, or Growth → Starter:

- Invoices, payments, stock rows, customers, and suppliers are not deleted.
- Transaction history and source drill-down stay available under the new plan’s record rules.
- Branch screens, consolidated totals, extra schedules, staff tables, and comparison controls stop opening.
- There is no saved-view store. The 5 and 25 caps stay frozen product defaults for a later Reports phase. Waves A–C must not build schema, route, UI, or persistence for saved views. If that later phase creates them, downgrade disables views above the new cap and does not delete them.
- `owner_daily_summary` stops on downgrade to Starter, including the cron path. A Pro daily summary follows the Pro schedule entitlement and stops when that entitlement no longer applies.
- Files already downloaded are the customer’s copies. TillFlow does not reach into their inbox.

### Freshness

Do not show All synced unless reliable device acknowledgement proves it. Do not show Syncing N unless the server genuinely knows N. Otherwise show: Based on data received by TillFlow as of [business-local time]. Open-shift expected cash must not be presented as finally reconciled while relevant data may be unsynced. An old counted-cash value must never be presented as the current comparison for an open shift. Any future acknowledgement mechanism is separate implementation work and must not be invented in this close-out.

Unproven sync labels are not normal available chrome. **Last calculated** may show the business-local time of a snapshot. That time is not an acknowledgement that devices have synced.

Pass A found report caches of 30s to 1 hour and no offline queue on report pages. A warm cache is not All synced.

### Reconciliation

Every total that claims to be a control total names its source rows and a difference:

| Total | Control |
|---|---|
| `sales_activity` | Sum of listed invoices equals the total, after the status filter |
| `payment_flow` | Sum of methods equals the confirmed total. Already required in Money Received |
| `cash_reconciliation` | Expected, counted, and variance match the shift row and the drawer entries |
| `customer_receivables` / `supplier_payables` | Open balance equals the listed documents |
| `margin.line.v1` | Ready total equals summed lines. Incomplete does not publish a total |

If the difference is not zero, show the difference. Do not hide it inside a rounded card.

### Metric versions

Only three, as specified in the catalogue:

- `margin.line.v1`
- `cash.expected.v1`
- `cash.variance.v1`

Each stored snapshot that displays them records `formula_id` and `effective_from`. Do not version sales totals, ageing, or stock counts in this contract.

---

## I. Entitlement test matrix

For every canonical id, automated checks must hit **screen, CSV, PDF, schedule, deep link, and share**. Each check calls `assertReportEntitlement` and expects the same allow or deny. A UI-only hide is a failed test.

| ID | Screen | CSV | PDF | Schedule | Deep link | Share |
|---|---|---|---|---|---|---|
| `sales_activity` | Allow all plans, manager default | Own-records allow. Margin column deny without `VIEW_MARGIN` | Same as CSV | Deny Starter. `owner_daily_summary` may include today’s sales total on Growth and, under the Pro schedule entitlement, on Pro | Same as screen | Same as schedule |
| `payment_flow` | Allow all plans | Allow all plans | Same | `owner_daily_summary` may include method totals when they fit | Same | Same |
| `cash_reconciliation` | Allow all plans | Allow (`eod` files) | Allow | `owner_daily_summary` may include open expected cash and a labelled closed variance as separate figures. It must not present an open shift as finally reconciled | Same. `/shifts/drawer` included | Same |
| `expense_activity` | Allow | Allow | Allow | Optional line on `owner_daily_summary` | Same | Same |
| `inventory_position` | Allow | Allow, all entitled stores | Allow | No | Same | No |
| `stock_movement` | Allow | Allow inside the records ZIP | Allow | No | Same | No |
| `purchase_activity` | Allow | Allow | Allow | No | Same | No |
| `customer_receivables` | Allow | Statement and ageing rows allow | Allow | Overdue total may appear on `owner_daily_summary` | Same | Same |
| `supplier_payables` | Deny without `VIEW_SUPPLIER_DEBT` | Same deny | Same deny | Omit amounts without the grant | Same deny | Same |
| `margin_performance` | Allow the quality-state figure on all plans. Deny rankings on Starter. Deny without `VIEW_MARGIN`. Compiled statement screens follow the financial-statement boundary | Deny `/exports/margins` on Starter and without grant. Sales file margin column matches. Starter still receives source rows | Same | `owner_daily_summary` may include GP only in state Ready; otherwise no GP figure | Same | Same |
| `variance_signals` | Deny Starter | Deny Starter (`/exports/risk-summary` already Growth) | Same | No | Same | No |
| `staff_activity` | Deny Starter. Deny without `VIEW_STAFF_ACTIVITY` | Deny on those plans and grants, including Weekly Digest and Business Movement files | Same | Do not include a cashier ranking in `owner_daily_summary` | Same | No |
| `branch_performance` | Deny unless Pro and `VIEW_BRANCH_COMPARISON` | Deny, including Business Movement CSV | Same | Pro packs only | Same | Pro packs only |
| `owner_today` | Allow owner. Partial manager | No separate file | No | No | Widgets use the family rows above | No |
| `owner_daily_summary` | Settings for the one Growth send. Pro may configure it only under the Pro schedule entitlement | No analytical CSV | No pack PDF | Starter deny, including cron. Growth: one SMS, one verified SMS destination. Pro: within the daily recipient cap. Destination rules in B3 | Same | Same |
| `management_pack` | Not built in Waves A–C. Entitlement reserved for Pro | Not built in Waves A–C | Not built in Waves A–C | Pro caps reserved. Starter and Growth deny. Not the daily SMS | Same | Same |
| Audit log | Pro owner | No file today; if added, same gate | Same | No | Same | No |
| Forecast | Pro owner | No file today; if added, same gate | Same | Pro monthly pack may include it | Same | Same |

### Current leaks these tests would fail

From Pass A §9. Listed so the tests have a known-red baseline. Not fixed in this phase.

| Test | Current result |
|---|---|
| `margin_performance` CSV on Starter | `GET /exports/margins` returns the file with no plan check |
| `sales_activity` margin column on Starter | `GET /exports/sales` always writes Margin |
| `owner_daily_summary` schedule on Starter | `GET /api/cron/eod-summary` enqueues the GP summary with no plan check, gates on `whatsappEnabled`, and prefers `whatsappPhone` |
| `branch_performance` screen and CSV on Starter or Growth | Business Movement renders and exports the branch table |
| `staff_activity` screen and CSV on Starter | Weekly Digest and Business Movement cashier tables, and their CSVs |
| `margin_performance` screen quality state | Trading Report and Command Center show a firm GP% with missing cost treated as a number |
| `supplier_payables` permission | Any manager can open ageing |
| `cash_reconciliation` deep link role | `/shifts/drawer` allows a cashier |
| `sales_activity` cashier deep link | Nav today sales is business-wide |
| Statement routes vs screen | Financial statement CSV matches the Growth screen (this one should stay green) |
| Risk summary vs screen | Growth on both (should stay green) |
| Owner Brief export vs screen | Screen is `OWNER` only. Export role list is `OWNER` and `MANAGER`, then Pro flag only. A Pro manager denied the screen can still download the export. This must fail until B13 |
| Supplier-sales export vs screen | Growth on both (should stay green) |

`GET /api/debug-financials` has no plan check and no environment gate. It is a Wave B security defect (B12), not an income-statement entitlement.

---

## Known-red list (not implemented)

No test file and no application file is added in this close-out. Owners below are the one primary implementer, in series. Independent QA does not own these rows.

Acceptance for every row: the cited behaviour no longer happens on the entitled path, the frozen contract holds, and the named test fails before the fix and passes after it.

### Expected-cash discovery precondition

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

Known at this close-out, and not a completed trace: `lib/reports/home-expected-cash.ts` sums open `Shift.expectedCashPence` and returns 0 when no shift is open. `lib/services/cash-drawer.ts` records entry types `OPEN_FLOAT`, `CASH_SALE`, `CASH_REFUND`, `CASH_DEBTOR_PAYMENT`, `PAID_OUT_SUPPLIER`, `PAID_OUT_EXPENSE`, `CLOSE_RECONCILIATION`, and `CASH_ADJUSTMENT`. The writer that stores `expectedCashPence` on close was not identified here. Files Wave A must inspect first are listed under Serial ownership.

### Wave A — owner-visible truth (12)

| ID | Failing behaviour now | Evidence | Future test file | Future implementation files | Depends on | Acceptance |
|---|---|---|---|---|---|---|
| A1 | Weekly Digest top margin divides `defaultCostBasePence` by 100 | `lib/reports/weekly-digest.ts` around the `estCost` lines | `lib/reports/weekly-digest-margin.contract.test.ts` | `lib/reports/weekly-digest.ts` | `margin.line.v1` semantics | Top margin uses `margin.line.v1` or is omitted when `INCOMPLETE_COSTS`. No `/100` |
| A2 | Trading Report and Command Center show a firm GP% when cost is missing | Pass A §2.5; `TradingDashboardContent.tsx`; command-center posture | `lib/reports/margin-quality.contract.test.ts` | `lib/reports/margin-analysis.ts`, `TradingDashboardContent.tsx`, `app/(protected)/reports/command-center/page.tsx` | A3 | `INCOMPLETE_COSTS` publishes no GP total |
| A3 | Line GP and stored `grossMarginPence` disagree | Weekly Digest sums `grossMarginPence`; other screens sum lines | `lib/reports/margin-quality.contract.test.ts` | `lib/reports/weekly-digest.ts`, `lib/reports/financials.ts`, `lib/reports/today-kpis.ts` | Frozen formula | Display does not read `grossMarginPence` |
| A4 | Product rank uses `lineSubtotalPence` on some screens and `lineTotalPence` on others | Pass A §8.4 | `lib/reports/product-rank.contract.test.ts` | `lib/reports/business-movement/query.ts`, `AnalyticsContent.tsx`, `lib/reports/supplier-sales.ts`, `weekly-digest.ts` | `sales_activity` group-by | One revenue field for product rank, documented as the family group-by |
| A5 | Command Center AR/AP ignore invoices older than 90 days | `lib/reports/today-kpis.ts` `ninetyDaysAgo` | `lib/reports/today-kpis-balances.contract.test.ts` | `lib/reports/today-kpis.ts` | A12 for the balance helper | Open balance includes invoices older than 90 days. Payment-status and statement equality are A12, not this row |
| A6 | Forecast trailing cash/MoMo does not require `CONFIRMED` | `lib/reports/forecast.ts` | `lib/reports/forecast.contract.test.ts` | `lib/reports/forecast.ts` | `payment_flow` | Trailing inflow uses confirmed payments only |
| A7 | Several reports use server-local midnight or Accra plus server midnight | Pass A §2.1; `date-parsing.ts`; `today-kpis.ts` | `lib/reports/reporting-clock.contract.test.ts` | `lib/reports/date-parsing.ts`, `today-kpis.ts`, `owner-dashboard.ts`, pages that call `resolveReportDateRange` | Clock section of the catalogue | Ghana gate tests in the catalogue are green. UK DST is not required for this gate |
| A8 | Home, Today KPIs, Owner Brief, and Cash Drawer do not share one expected-cash definition | Pass A §8.7 | `lib/reports/cash-expected.contract.test.ts` | `lib/reports/home-expected-cash.ts`, `lib/services/cash-drawer.ts`, `owner-dashboard.ts`, `today-kpis.ts`, and the close writer once the discovery precondition names it | `cash.expected.v1` and the discovery precondition | Stop blocked if the writers cannot be traced. Otherwise one function. No second engine beside an unidentified writer |
| A9 | Stored shift expected cash is not proven equal to a live canonical result | No fixture compares them | `lib/reports/cash-expected.contract.test.ts` | The close writer located by the discovery precondition. Not guessed in this close-out | A8 | Ordinary close, owner-override close, retry, and any offline or alternate close path that writes `expectedCashPence` match the live result for the same source rows |
| A10 | Business Movement stock insights are hard-off and marked not reliable | `stockInsightsEmitted: false` in `lib/reports/business-movement` | `lib/reports/business-movement/business-movement.test.ts` (extend the existing stock-gate case; do not treat the current assertion of `false` as success) | `lib/reports/business-movement/sales-comparison.ts` | `stock_movement` | The block is absent or sourced from `stock_movement`. It does not emit a stock total of its own |
| A11 | Daily SMS body uses stored GP, has no segment cap, and does not use the frozen freshness sentence. The same function also prefers `whatsappPhone` and gates on `whatsappEnabled` while writing `channel: 'SMS'` | `buildOwnerDailySummarySms`, `resolveOwnerRecipient` | `lib/notifications/owner-daily-summary-sms.contract.test.ts` | `lib/notifications/owner-daily-summary-sms.ts` | A2, A7, SMS payload section of `PLAN_ENTITLEMENT_MATRIX.md` | Formatter tests in that section pass, including 306 GSM-7 septets, `GHS`, mandatory fields, overflow order, freshness wording, open expected cash versus closed variance, incomplete-cost GP, and priority actions. No WhatsApp provider, route, UI, copy, or test stub. Destination resolution, consent, opt-out, and the cron plan check are B3 |
| A12 | Customer and supplier statements sum payments with no authoritative payment-status filter. `computeOutstandingBalance` in `lib/reports/operational-metrics.ts` takes `{ amountPence }` only. `lib/accounting.ts` returns 0 when the invoice status is `RETURNED`, `VOID`, or `PAID`, and otherwise sums every payment amount with no payment-status filter. A5 only removes the 90-day cutoff | Statement routes under `app/(protected)/customers/[id]/statement/route.ts` and `app/(protected)/suppliers/[id]/statement/route.ts`. Both helpers. `PurchasePayment` has no `status` column in `prisma/schema.prisma` | `lib/reports/balance-integrity.contract.test.ts` | One new receivables helper and one new payables helper, consumed by both statement routes and by `lib/reports/today-kpis.ts`. Retire the two current outstanding-balance helpers as the callers move. Do not add a supplier-payment status column in this row | Catalogue receivables and payables rules | Eligible customer payments are `SalesPayment.status = CONFIRMED` only. `FAILED`, `CANCELLED`, `VOID`, `PENDING`, `PENDING_MANUAL`, and any other status are excluded. There is no `REVERSED` status on `SalesPayment`; those three excluded strings are the reversal statuses found in the reporting lists. Supplier payments have no status: every stored `PurchasePayment.amountPence` counts, and a `PurchaseReturn` refund is not subtracted again when the invoice is `RETURNED` or `VOID`. Partial payments stay `PART_PAID` (and a stored `PARTIAL` invoice status stays open). A new payment that would exceed the invoice total is rejected. A stored eligible sum that already exceeds the total is shown as a reconciling excess, not capped into a silent zero balance. `RETURNED` and `VOID` invoices contribute 0. Invoices older than 90 days are included. Customer statement Paid and Balance, and supplier statement Paid and Balance, equal the helpers. A list total equals the sum of those source-document balances |

### Wave B — entitlement and store scope (13)

| ID | Failing behaviour now | Evidence | Future test file | Future implementation files | Depends on | Acceptance |
|---|---|---|---|---|---|---|
| B1 | `GET /exports/margins` has no plan check | `app/(protected)/exports/margins/route.ts` | `app/(protected)/exports/margins/entitlement.contract.test.ts` | that route | `VIEW_MARGIN`, Growth | Starter and a manager without the grant receive the same deny as the page |
| B2 | `GET /exports/sales` always writes Margin | `app/(protected)/exports/sales/route.ts` | `app/(protected)/exports/sales/entitlement.contract.test.ts` | that route | A2 so the entitled column uses `margin.line.v1` | Starter file has stored cost and no computed margin. Entitled Ready lines may include margin |
| B3 | Cron enqueues the summary with no plan check. The live path uses `whatsappEnabled`, prefers `whatsappPhone`, and writes an SMS outbox record | `app/api/cron/eod-summary/route.ts`, `resolveOwnerRecipient`, outbox `channel: 'SMS'` | `app/api/cron/eod-summary/entitlement.contract.test.ts` | that route and the recipient resolver called from it. Wave B must not rewrite the A11 formatter | A11 | Starter is not enqueued. Growth enqueues one SMS. Pro may be enqueued only under the Pro daily schedule entitlement. Destination resolves to an explicitly verified SMS-capable phone. `whatsappPhone` is never used merely because it exists. WhatsApp preference is not treated as SMS consent. A WhatsApp-only identity cannot receive the SMS. Consent and opt-out rules are enforced. No WhatsApp provider, route, UI, copy, or test stub is introduced |
| B4 | Business Movement shows and exports branch and cashier tables on every plan | page and `lib/reports/business-movement/export.ts` | `lib/reports/business-movement/business-movement-export-access.test.ts` (extend) | `app/(protected)/reports/business-movement/page.tsx`, `export.ts` | Pro, `VIEW_BRANCH_COMPARISON`, `VIEW_STAFF_ACTIVITY` | Starter and Growth responses omit both tables |
| B5 | Weekly Digest screen and CSV include comparison, GP, and cashier tables on every plan | page and `app/api/reports/weekly-digest/route.ts` | `app/api/reports/weekly-digest/entitlement.contract.test.ts` | `weekly-digest/page.tsx`, `app/api/reports/weekly-digest/route.ts` | A1 for the GP math; this row is the gate | Starter does not receive comparison, staff, or a GP figure the plan does not allow |
| B6 | Reports hub cards for a higher plan still navigate | `app/(protected)/reports/page.tsx` lines 362–365 change the badge only | `lib/reports/reports-index-polish.test.ts` (extend) | `app/(protected)/reports/page.tsx` | Plan matrix | A Starter click does not open a higher-plan calculation. Record links stay |
| B7 | Inventory export reads the first store only | `app/(protected)/exports/inventory/route.ts` `findFirst` | `app/(protected)/exports/inventory/store-scope.contract.test.ts` | that route | Active-store rule | The file is the entitled store set. It does not pick `findFirst` |
| B8 | Starter or Growth can still query every store if two `Store` rows exist | Business Movement does not read `getFeatures().multiStore` | `lib/reports/reporting-store-scope-routes.test.ts` (extend) | report scope helper used by movement, today KPIs, weekly digest | Store boundary in the plan matrix | A second store is not operational and is not compared |
| B9 | Downgrade behaviour for historical stores is not specified in code | No downgrade report path found in Pass A | `lib/reports/store-retention.contract.test.ts` | future store-activation guard. No deletion migration | B8 | After downgrade, prior store rows remain readable and are not operational |
| B10 | Risk Monitor says “anti-fraud” | `app/(protected)/reports/risk-monitor/page.tsx` | `lib/services/risk-monitor-language.contract.test.ts` | that page | Language list in this file | Those strings are gone. Replacement labels are the permitted list |
| B11 | Screen, file, and cron do not call one entitlement function | Pass A §9 | one contract test per route in B1–B5 and B13 | `assertReportEntitlement` introduced in Wave B, called from those routes | B1–B5, B13 | Direct URL, CSV, and cron deny together |
| B12 | `GET /api/debug-financials` exposes purchase totals, journal counts, account codes, AP balance, and inventory GL balance to any owner or manager. It is not development-only and not fail-closed | `app/api/debug-financials/route.ts`. `middleware.ts` gates `/dev/` only | `app/api/debug-financials/security.contract.test.ts` | that route | None | In Preview and Production the route does not return financial aggregates. Unauthenticated, cashier, and cross-tenant requests are denied. A negative test fails closed when the environment is not an explicit local diagnostic |
| B13 | Owner Brief screen is owner-only. The export route admits managers, then checks only the Pro flag | `app/(protected)/reports/owner/page.tsx` `requireBusiness(['OWNER'])`. `app/(protected)/reports/owner/export/route.ts` `requireBusiness(['OWNER', 'MANAGER'])` | `app/(protected)/reports/owner/export/entitlement.contract.test.ts` | the export route. Screen and export must share one decision | B11 | A manager denied the screen is denied `GET /reports/owner/export`, including a direct request on Pro |

### Wave C — permissions (12)

| ID | Failing behaviour now | Evidence | Future test file | Future implementation files | Depends on | Acceptance |
|---|---|---|---|---|---|---|
| C1 | New managers are not distinct from current managers | No grant table | `lib/auth/report-grants.contract.test.ts` | future grant module. Schema owned by the integration lead before Wave C | This file’s grant section | A new manager has none of the five grants |
| C2 | Sensitive surfaces ignore the five grants | Pass A §7 | same test file | each surface named on the grant table, after Wave A/B gates | C1 | Deny when the grant is absent, including CSV |
| C3 | Nothing stops a manager granting themselves | No grant write path | same test file | future Staff/Permissions action | C1 | A manager write is denied and audited |
| C4 | No 30-day `LEGACY_ACCESS` record | Not in schema | `lib/auth/legacy-report-grants.contract.test.ts` | grant module. Migration by the integration lead | C1 | Existing managers are marked legacy, not silently stripped on day 1 |
| C5 | No day-31 server denial | Not in schema | same | grant check on the request, not a cron | C4 | On local day 31 an unconfirmed grant fails even if no job has run |
| C6 | No owner confirm or revoke | Not in schema | same | Staff/Permissions action | C4 | Confirm and revoke persist and are audited |
| C7 | No audit of grant changes | Audit log exists for other actions, not for these grants | same | grant module writing `AuditLog` | C6 | Confirmation, revocation, and expiry each write an audit row |
| C8 | Plan downgrade does not clear an ineligible grant | No grant exists to clear | same | grant check reads plan first | Plan matrix | An ineligible grant does not open the surface |
| C9 | Re-upgrade must not restore an expired legacy grant | Not in schema | same | grant module | C5, C8 | Expired or unconfirmed legacy stays off after upgrade |
| C10 | Cashier nav sales are business-wide | `app/actions/nav-kpis.ts` | `app/actions/nav-kpis.contract.test.ts` | `nav-kpis.ts`, `components/TopNav.tsx` | Cashier scope | The figure is that cashier’s active shift only |
| C11 | `/shifts/drawer` allows any signed-in role | `app/(protected)/shifts/drawer/page.tsx` | `app/(protected)/shifts/drawer/scope.contract.test.ts` | that page | Cashier scope | A cashier may open only their active shift, till, and store |
| C12 | Cross-till and cross-store ids are not rejected on that drawer route | Same page, no role array | same test | that page | C11 | A changed shift, till, or store id is denied |

Counts: Wave A 12, Wave B 13, Wave C 12. Total 37.

Highest risk: A2 and A3 (a confident wrong profit figure), A8/A9 (cash close that does not match, and Wave A blocked until the expected-cash writers are traced), A12 (statement balances that ignore payment status), B1/B2/B3 (files and SMS that skip the plan or the SMS destination), B12 (debug financials open in deployed environments), B13 (Owner Brief export), C11 (cashier drawer not scoped).

---

## Serial ownership

One primary implementer. No parallel workstream.

1. Integration lead: these contracts, and any future Prisma schema or migration.
2. Wave A implementation.
3. Wave A gate (Ghana clock tests and the A-rows). UK DST stays outstanding until the v1 stamp.
4. Wave B implementation.
5. Wave B gate.
6. Wave C implementation, only after the integration lead’s migration is in the same branch.
7. Wave C gate.
8. Bounded consolidation.
9. Independent QA, separate session.
10. Preview deployment.
11. Owner walkthrough.

Files Wave A must inspect first, before editing expected-cash code: `lib/reports/home-expected-cash.ts`, `lib/services/cash-drawer.ts`, and every assignment of `expectedCashPence`, including ordinary close, owner-override close, retry or idempotency, an offline close path if one exists, and any alternate close API or server action. If that trace is incomplete, Wave A stops blocked.

Wave A files, exclusive to that phase (the same person may edit them in a later wave only after the prior gate):

- `lib/reports/weekly-digest.ts`
- `lib/reports/margin-analysis.ts`
- `lib/reports/financials.ts`
- `lib/reports/today-kpis.ts`
- `lib/reports/owner-dashboard.ts`
- `lib/reports/forecast.ts`
- `lib/reports/home-expected-cash.ts`
- `lib/reports/date-parsing.ts`
- `lib/reports/business-movement/sales-comparison.ts` and `query.ts` for A4 and A10 only
- `lib/services/cash-drawer.ts`
- `lib/notifications/owner-daily-summary-sms.ts` for A11 content
- `app/(protected)/reports/dashboard/TradingDashboardContent.tsx`
- `app/(protected)/reports/command-center/page.tsx`
- `app/(protected)/reports/analytics/AnalyticsContent.tsx`
- `lib/reports/supplier-sales.ts` for the A4 field alignment
- `lib/reports/operational-metrics.ts` and `lib/accounting.ts` for A12, replaced by one receivables helper and one payables helper
- `app/(protected)/customers/[id]/statement/route.ts` and `app/(protected)/suppliers/[id]/statement/route.ts` for A12 Paid and Balance only. Wave C still owns the supplier-debt grant on the supplier statement

Wave B files, not edited in Wave A:

- `app/(protected)/exports/margins/route.ts`
- `app/(protected)/exports/sales/route.ts`
- `app/(protected)/exports/inventory/route.ts`
- `app/(protected)/reports/page.tsx`
- `app/(protected)/reports/business-movement/page.tsx`
- `lib/reports/business-movement/export.ts`
- `app/(protected)/reports/weekly-digest/page.tsx`
- `app/api/reports/weekly-digest/route.ts`
- `app/api/cron/eod-summary/route.ts`
- `app/(protected)/reports/risk-monitor/page.tsx`
- `app/api/debug-financials/route.ts`
- `app/(protected)/reports/owner/export/route.ts` for B13 only. Wave A may still correct the brief’s calculations in `lib/reports/owner-dashboard.ts` and must not widen the export role list

Wave C files, not edited in A or B:

- `app/(protected)/shifts/drawer/page.tsx`
- `app/actions/nav-kpis.ts`
- `components/TopNav.tsx`
- the future grant module and the one Staff/Permissions screen

Overlaps, still one person, serial, not two agents:

| File | Why it overlaps | Who edits it first |
|---|---|---|
| `lib/reports/weekly-digest.ts` | A1/A3 math, then B5 gate if the gate cannot live only on the route | Wave A. Wave B prefers the route and page. The lib is not edited again unless the route cannot enforce the gate |
| `lib/notifications/owner-daily-summary-sms.ts` | A11 body, and the enqueue path is also how a Starter could be sent | Wave A owns the body. Wave B owns `app/api/cron/eod-summary/route.ts` and must not rewrite the formatter |
| `lib/reports/business-movement/query.ts` | A4 product field and B4 branch rows are produced together | Wave A may change the product money field. Wave B hides branch and cashier at the page and export. Wave B does not fork a second product total |
| Shift close writer | A9 equality. The file is not named until the discovery precondition locates every `expectedCashPence` writer | Wave A only, once located. If it cannot be traced, Wave A stops blocked. It is not pre-assigned to a second person |

If a later run uses more than one agent, the integration lead assigns these files exclusively and keeps the same gates. This close-out does not start that run.

---

## Independent QA

The wave implementer does not author the final Independent QA PASS.

Independent QA is a separate Cursor session. It reviews the exact final integrated SHA, read-only first, then runs isolated or Preview adversarial tests. It does not treat the implementer’s conclusions as evidence. It returns PASS or FAIL with evidence.

Joshua’s walkthrough does not replace that review.

---

## Future Production packaging

No Production action is authorised by this close-out.

The final remediation report, after the gates, must recommend ranked bundles that are safe to deploy independently, for example:

1. calculation-truth fixes (Wave A)
2. entitlement and export fixes (Wave B)
3. permission and schema changes (Wave C)

For each bundle the report states the exact commits, dependencies, whether a migration is required, the rollback path, the Preview evidence, and whether that bundle can deploy without the others.

Do not assume A, B, and C deploy as one release. Do not split one formula so two deployments show different totals for the same quantity. Do not deploy from this prompt.
