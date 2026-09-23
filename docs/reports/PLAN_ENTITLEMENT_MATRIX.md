# Plan entitlement matrix

Status: proposal for Joshua to freeze. Not implemented.

Evidence: `docs/reports/PASS_A_INVENTORY.md`. Plan flags today live in `lib/features.ts`. This matrix is the target. It is not what `getFeatures` returns today.

Growth is strictly single-store. No second location, no “all branches” label, no branch table. Pro owns branch comparison, consolidated totals, stock-transfer reporting, cross-branch cash and stock controls, and consolidated receivables and payables.

Numeric caps below are the draft caps, except the Growth schedule, which is replaced with a precise number. The reason is in that section.

---

## All plans — records, never paywalled

Available to `OWNER` and to a `MANAGER` who has the matching permission in `REPORT_ACCESS_AND_EXPORT_CONTRACT.md`. Single-store scope on Starter and Growth. Date range: any date the rows exist. No 30-day cap on these lists.

- Sales invoices and lines, voids, returns, discounts (`sales_activity` list and totals).
- Confirmed payments and unconfirmed MoMo queue (`payment_flow`).
- Expected vs counted cash and shift rows (`cash_reconciliation`), including the not-final state when tills are unsynced.
- Expenses and expense payments (`expense_activity`).
- Stock on hand and low/out against reorder point (`inventory_position`).
- Stock ledger rows (`stock_movement`), but transfer **analytics** and transfer actions on Today are Pro.
- Purchase invoices (`purchase_activity`).
- Customer balances, overdue, missing due date (`customer_receivables`). Not the 90-day slice in `getTodayKPIs`.
- Supplier balances, overdue, missing due date (`supplier_payables`).
- Gross profit for a chosen record period in state Ready, Incomplete costs, or Hidden (`margin.line.v1`).
- Source drill-down from any total to the rows.
- Own-records CSV defined in the access contract. Computed margin columns are not part of the Starter file.

Starter and Growth never receive `branch_performance`, consolidated multi-store totals, or transfer reporting. If a non-Pro database has two `Store` rows, reports still scope to the single operational store. Pass A shows Business Movement does not do this today.

---

## Starter

Promise: “Is my money and stock honest today?”

| Capability | Cap |
|---|---|
| `owner_today` | Yes |
| Analytics window | **Today, plus one rolling 30 local-day trend** |
| What the 30-day trend contains | Daily recognised sales total, and daily confirmed money received. No other series |
| Period comparison | **None.** No previous-week column, no month-vs-month, no Analytics previous window |
| Saved analytical views | **0** |
| Scheduled reports | **0** |
| Branch comparison, consolidation, transfers | **0** |
| `staff_activity` | **0** |
| 30/60/90 ageing **charts** | No. Overdue total and missing due date remain visible as records |
| Velocity reorder list | No. Low/out from reorder point remains visible |
| Income statement category depth, balance sheet, indirect cashflow, forecast | No |
| Margin ranking, below-target list, margin trend | No. One GP figure with data-quality state remains |

Pass A gaps this cap would close: Weekly Digest previous week, Business Movement comparison, Trading Report unbounded custom ranges used as trends, Analytics if the page gate is bypassed, and cashier tables on Weekly Digest.

Trading Report as a long record extract (invoice totals for a past month) stays. Only the trend chart and comparison UI are capped.

---

## Growth — strictly single-store

Promise: “I can manage without standing at the till.”

| Capability | Cap |
|---|---|
| Store scope | Exactly one store. Branch filter hidden. “All branches” copy removed |
| Analytics window | **13 calendar months** ending today, business timezone |
| Period comparison | **Two periods**, both inside that 13-month window, equal length or calendar month vs previous calendar month |
| Saved analytical views | **5** |
| Scheduled delivery | **1 per local day**, see replacement below |
| Ageing | 30/60/90 summary **inside the 13-month window**, plus the all-plan overdue warnings |
| `staff_activity` | Yes, with the safeguards in the access contract |
| Stock movement value trend and reorder velocity | Yes, inside 13 months |
| `margin_performance` dimensions | Product and category. Not branch. Preferred-supplier is a sales group-by, still not debt |
| Statement products | Income statement, balance sheet, indirect cashflow |
| `branch_performance`, consolidation, transfer reporting, forecast, management pack | **No** |

### Schedule replacement (draft challenged)

Draft text: “1 monthly owner summary (email and/or in-app)”.

**Replaced with:** Growth schedules **exactly 1** owner summary **per local business day**, to **exactly 1** recipient (the owner destination already stored for WhatsApp/SMS). Channel: the existing outbox in `enqueueOwnerDailySummarySms`. No second weekly or monthly schedule on Growth. No extra email recipient.

Reason: Pass A §6. The only scheduler in the repo is the daily EOD SMS. Settings and preview already require Growth (`features.advancedOps` in `lib/notifications/daily-summary-access.ts`). The cron path does not check the plan; the contract requires it to. A monthly-only Growth cap would either remove that shipped daily summary or allow two schedules. One daily send keeps the “1 scheduled” shape and matches the code that exists.

The draft monthly pack is not added on Growth. It is a Pro `management_pack`.

Saved-view caps of 5 and 25 are new. Pass A found no saved-view model. The draft numbers are unchanged.

---

## Pro

Promise: “I can control branches and receive management packs without hiring an analyst.”

| Capability | Cap |
|---|---|
| Store scope | Every store on the business, one store, or consolidated |
| `branch_performance` | Yes |
| Stock transfers in reports, and the Today transfer action | Yes, and only when transfers are enabled for the business. Otherwise the action is absent, not a locked card |
| Consolidated receivables and payables | Yes |
| Analytics window | The retained history. No shorter analytical cap than record retention |
| Period comparison | Any two periods inside retained history |
| Saved analytical views | **25** |
| Scheduled packs | Daily, weekly, and monthly. Recipient caps below |
| Margin dimensions | Product, category, preferred supplier, branch |
| Forecast | Yes, using confirmed `payment_flow` only |
| `management_pack` | Yes |

### Recipient caps (draft left these undefined)

| Pack | Max recipients | Who |
|---|---|---|
| Daily | 3 | Users of the business. The owner counts as one |
| Weekly | 5 | Same |
| Monthly | 10 | Same |

No purchased external distribution list. Channel for these packs: email and in-app. WhatsApp remains the single Growth daily summary, not a Pro blast. These caps are a proposal because no recipient table exists (Pass A §6). They are the numbers to freeze or replace with other integers.

---

## Side-by-side

| | Starter | Growth | Pro |
|---|---|---|---|
| Stores in reports | 1 | 1 | Many + consolidated |
| Record history | Any date stored | Any date stored | Any date stored |
| Trend | Today + 30 daily points of sales and money received | 13 months | Retained history |
| Period compare | 0 | 2 periods inside 13 months | Any 2 in retained history |
| Saved views | 0 | 5 | 25 |
| Schedules | 0 | 1 daily owner SMS/WhatsApp | Daily, weekly, monthly packs |
| Staff activity | No | Yes, permitted managers | Yes, permitted managers |
| Branch comparison | No | No | Yes |
| Transfers in reports | No | No | Yes, if the feature is on |
| GP view | Yes, with quality state | Yes, plus trends inside 13 months | Yes, plus branch dimension |

Downgrade behaviour is in `REPORT_ACCESS_AND_EXPORT_CONTRACT.md`. Nothing in this matrix deletes rows.
