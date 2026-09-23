# Report access and export contract

Status: proposal for Joshua to freeze. Not implemented.

Covers permissions, files, empty states, downgrade, freshness, reconciliation, metric versions, and the entitlement test matrix. Plan numbers are in `PLAN_ENTITLEMENT_MATRIX.md`. Families are in `REPORT_CATALOGUE.md`.

Roles that exist today: `OWNER`, `MANAGER`, `CASHIER`. No finer permission flags exist (Pass A §7). This contract adds five explicit grants. Tier and grant are separate. A Pro cashier still cannot open staff activity. A Starter owner still cannot open branch comparison.

---

## E. Permissions

### Grant names

| Grant | Allows |
|---|---|
| `perm.margin` | `margin_performance` figures, cost completeness counts, margin columns on files |
| `perm.supplier_debt` | `supplier_payables` amounts |
| `perm.company` | All stores of a **Pro** business in one total. On Starter and Growth there is only one store, so this grant is unused |
| `perm.branch` | `branch_performance`. Pro only |
| `perm.staff` | `staff_activity`. Growth and Pro |

Owner holds all five grants that their plan allows. They cannot be removed by another user.

Manager defaults, until an owner changes them:

| Family or product | Manager default |
|---|---|
| `sales_activity`, `payment_flow`, `cash_reconciliation`, `expense_activity`, `inventory_position`, `stock_movement`, `purchase_activity`, `customer_receivables` | On |
| `perm.margin`, `perm.supplier_debt`, `perm.company`, `perm.branch`, `perm.staff` | **Off** |
| Audit log | Off (owner, Pro) |
| `owner_today` | On for the families they can see |

Cashier: no report screen, no export, no Owner Today. The open-shift sales total on the till they are using may stay on the till. Business-wide nav sales (Pass A §3.29) does not.

Existing managers can already see profit and supplier debt. Turning those grants off by default changes that. Do not migrate working managers to “off” until Joshua accepts that cut-over. The target default for **newly created** managers is off.

### Family access

| ID | Owner | Manager | Cashier | Plan note |
|---|---|---|---|---|
| `sales_activity` | Yes | Default on | No | Records all plans. Trends follow the matrix |
| `payment_flow` | Yes | Default on | No | Records all plans |
| `cash_reconciliation` | Yes | Default on | No | Records all plans. `/shifts/drawer` must use this same role rule. Today it does not |
| `expense_activity` | Yes | Default on | No | All plans |
| `inventory_position` | Yes | Default on | No | Position all plans. Velocity list Growth+ |
| `stock_movement` | Yes | Default on | No | Ledger all plans |
| `purchase_activity` | Yes | Default on | No | All plans |
| `customer_receivables` | Yes | Default on | No | All plans |
| `supplier_payables` | Yes | `perm.supplier_debt` | No | All plans once granted |
| `margin_performance` | Yes | `perm.margin` | No | Quality-state figure all plans. Rankings and trends Growth+ |
| `variance_signals` | Yes | Default on for signals in families they can already open. Staff clustering needs `perm.staff` | No | Signal list is Growth+. The source shift or void row stays a record |
| `staff_activity` | Yes | `perm.staff` | No | Not Starter |
| `branch_performance` | Yes | `perm.branch` and `perm.company` | No | Pro only |
| `owner_today` | Yes | Partial | No | All plans |
| `management_pack` | Yes | No, unless the owner adds them as a Pro pack recipient | No | Growth: the one daily SMS to the owner. Pro: packs |
| Audit log | Yes | No | No | Pro |
| Forecast | Yes | No | No | Pro |

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

Do not write theft, fraud, suspicious employee, or anti-fraud. Risk Monitor uses “anti-fraud” today (Pass A §3.21). That copy does not survive this contract.

---

## F. CSV and export scope

One server function authorises the screen, the file, the PDF, the schedule, the deep link, and any future share. Name to implement later: `assertReportEntitlement`. This document does not add it. Routes must not grow a second, weaker check.

Own-records file vs management pack:

| | Own-records CSV | Management pack |
|---|---|---|
| Who | Every plan, with the row’s permission | Growth: the one daily summary only. Pro: daily, weekly, monthly packs |
| What | Source rows the business already stored | A composed file: comparison, rankings, branch pages, narrative totals |
| Margin math columns | Only with `perm.margin` | Only with `perm.margin` |
| Date | Any stored date on Starter for **rows**. Growth analytical packs stay inside 13 months. Pro packs stay inside retained history | Same as the viewer’s analytics window |

### Own-records entities

| Entity | Starter columns | Growth and Pro extra |
|---|---|---|
| Sales lines | Invoice, date, store, customer, product, SKU, qty, unit, unit price, discount, subtotal, VAT, total, **stored line cost** | Computed margin and margin % only with `perm.margin` and only in state Ready. Incomplete lines omit the margin cell and set a cost-state column |
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

`GET /exports/sales` currently always emits Cost and Margin for every plan (Pass A §6). Under this contract the Margin column is removed unless `perm.margin` is on and `margin.line.v1` is Ready for that line. Stored cost stays.

`GET /exports/margins` becomes the analytical margin file: Growth or Pro, `perm.margin`, inside the plan’s analytics window, same gate as the screen.

`GET /exports/inventory` must cover every store the viewer is entitled to. The first-store-only query is not allowed.

`GET /api/exports/pack` is an own-records ZIP (sales ledger, purchases, VAT, debtors, stock movements) on every plan. It is not a management pack. It must not gain branch comparison or cashier ranking pages.

Row caps:

| Plan | Own-records file | Analytical file or pack |
|---|---|---|
| Starter | No row cap for stored rows. Date filter optional | 30 local days, and only the two trend series. No margin ranking file |
| Growth | No row cap for stored rows | 13 months |
| Pro | No row cap for stored rows | Retained history |

No file may return 200 with another tenant’s `businessId`. Money Received already enforces tenant and branch (`resolveMoneyReceivedAccess`). The shared entitlement function must do that for every route.

PDF and HTML print use the same check as CSV. Owner Brief HTML export is a Pro management summary, owner only, which matches its current flag. It must call the same function.

Share and WhatsApp: there is no per-report share control today. Any later share uses the same function. The Growth daily SMS is the one scheduled share, and the cron route must call the same plan check the settings page uses.

`GET /api/debug-financials` is a financial extract. It takes the income-statement entitlement (Growth+, `perm.margin`), not an open manager route.

---

## G. Empty and unavailable states

Use one pattern for plan locks on analytics: **More insights with Growth** or **More insights with Pro**, on the analytical control that was refused. Do not put padlocks on sales totals, balances, stock on hand, or expected cash.

| State | When | What the user sees |
|---|---|---|
| Shown | Entitled, and the query succeeded | The figure or the rows |
| Not set up yet | The business has no products, no till, or no opening stock, and the widget needs that setup | **Not set up yet** and the existing setup link |
| Hidden, feature irrelevant | Transfers on Starter or Growth; branch comparison when the plan is not Pro; a second store | The block is absent. Not a locked card |
| Locked, plan | Starter opens a comparison, a staff table, a schedule, or a 13-month trend | **More insights with Growth** or **More insights with Pro**. Records on the same page stay visible |
| Unavailable, permission | Manager lacks `perm.margin`, `perm.supplier_debt`, `perm.staff`, `perm.branch`, or `perm.company` | **You don’t have access to this report.** No numbers, including zeroes |
| Blocked, data | Margin state Incomplete or Hidden; receipt query failed; tills unsynced for a cash close | The state name from the catalogue. Not a substituted zero |
| Empty, real zero | Query succeeded and the sum is zero | The empty copy from `OWNER_TODAY_CONTRACT.md` or **No rows in this period** |

---

## H. Downgrade, freshness, reconciliation, versions

### Downgrade

Pro → Growth, or Growth → Starter:

- Invoices, payments, stock rows, customers, and suppliers are not deleted.
- Transaction history and source drill-down stay available under the new plan’s record rules.
- Branch screens, consolidated totals, extra schedules, staff tables, and comparison controls stop opening.
- Saved views are kept and marked disabled when the new plan’s count or window does not allow them. They are not deleted. On a later upgrade they open again if they still fit.
- The one Growth daily summary stops on downgrade to Starter, including the cron path.
- Files already downloaded are the customer’s copies. TillFlow does not reach into their inbox.

### Freshness

Each canonical total shows **Last calculated** as the business-local time of the snapshot, and the sync line from Owner Today when any offline queue is non-empty: **All synced**, **Syncing N**, or **Last synced …**.

Pass A found report caches of 30s to 1 hour and no offline queue on report pages. The contract requires the sync line even when the cache is warm. A warm cache is not “all synced”.

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
| `sales_activity` | Allow all plans, manager default | Own-records allow. Margin column deny without `perm.margin` | Same as CSV | Deny Starter. Growth daily summary may include today’s sales total | Same as screen | Same as schedule |
| `payment_flow` | Allow all plans | Allow all plans | Same | Growth daily may include method totals | Same | Same |
| `cash_reconciliation` | Allow all plans | Allow (`eod` files) | Allow | Not in the Growth SMS unless it is the expected/counted pair with sync state | Same. `/shifts/drawer` included | Same |
| `expense_activity` | Allow | Allow | Allow | Optional line on Growth daily | Same | Same |
| `inventory_position` | Allow | Allow, all entitled stores | Allow | No | Same | No |
| `stock_movement` | Allow | Allow inside the records ZIP | Allow | No | Same | No |
| `purchase_activity` | Allow | Allow | Allow | No | Same | No |
| `customer_receivables` | Allow | Statement and ageing rows allow | Allow | Overdue total may appear on Growth daily | Same | Same |
| `supplier_payables` | Deny without `perm.supplier_debt` | Same deny | Same deny | Omit amounts without the grant | Same deny | Same |
| `margin_performance` | Allow the quality-state figure on all plans. Deny rankings on Starter. Deny without `perm.margin` | Deny `/exports/margins` on Starter and without grant. Sales file margin column matches | Same | Growth SMS may include GP only in state Ready; otherwise the incomplete sentence | Same | Same |
| `variance_signals` | Deny Starter | Deny Starter (`/exports/risk-summary` already Growth) | Same | No | Same | No |
| `staff_activity` | Deny Starter. Deny without `perm.staff` | Deny on those plans and grants, including Weekly Digest and Business Movement files | Same | Do not include a cashier ranking in the Growth SMS | Same | No |
| `branch_performance` | Deny unless Pro and `perm.branch` | Deny, including Business Movement CSV | Same | Pro packs only | Same | Pro packs only |
| `owner_today` | Allow owner. Partial manager | No separate file | No | No | Widgets use the family rows above | No |
| `management_pack` | Pro preview. Growth: settings for the one daily send only | Pro pack file. Growth: no analytical CSV | Pro | Growth 1/day. Pro within recipient caps. Starter deny, **including cron** | Same | Same |
| Audit log | Pro owner | No file today; if added, same gate | Same | No | Same | No |
| Forecast | Pro owner | No file today; if added, same gate | Same | Pro monthly pack may include it | Same | Same |

### Current leaks these tests would fail

From Pass A §9. Listed so the tests have a known-red baseline. Not fixed in this phase.

| Test | Current result |
|---|---|
| `margin_performance` CSV on Starter | `GET /exports/margins` returns the file with no plan check |
| `sales_activity` margin column on Starter | `GET /exports/sales` always writes Margin |
| `management_pack` schedule on Starter | `GET /api/cron/eod-summary` enqueues the GP summary with no plan check |
| `branch_performance` screen and CSV on Starter or Growth | Business Movement renders and exports the branch table |
| `staff_activity` screen and CSV on Starter | Weekly Digest and Business Movement cashier tables, and their CSVs |
| `margin_performance` screen quality state | Trading Report and Command Center show a firm GP% with missing cost treated as a number |
| `supplier_payables` permission | Any manager can open ageing |
| `cash_reconciliation` deep link role | `/shifts/drawer` allows a cashier |
| `sales_activity` cashier deep link | Nav today sales is business-wide |
| Statement routes vs screen | Financial statement CSV matches the Growth screen (this one should stay green) |
| Risk summary vs screen | Growth on both (should stay green) |
| Owner export vs screen | Pro on both (should stay green) |
| Supplier-sales export vs screen | Growth on both (should stay green) |

Debug financials (`GET /api/debug-financials`) has no plan check. The matrix puts it on the income-statement row.
