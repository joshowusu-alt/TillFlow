# Plan entitlement matrix

Status: frozen for Joshua review (contract close-out, 2026-09-23). Not implemented.

Evidence: `docs/reports/PASS_A_INVENTORY.md`. Plan flags today live in `lib/features.ts`. This matrix is the target. It is not what `getFeatures` returns today.

Growth is strictly one active operational store. No second active store, no “all branches” label, no branch table. Pro owns branch comparison, consolidated totals, stock-transfer reporting, cross-branch cash and stock controls, and consolidated receivables and payables.

### Active store and historical stores

| Plan | Active operational stores |
|---|---|
| Starter | 1 |
| Growth | 1 |
| Pro | More than one is allowed |

On Pro downgrade to Growth or Starter:

- historical rows from every prior store stay intact
- those source records stay readable
- only one store may remain operational
- no store row and no transaction row is deleted
- no row is rewritten onto the remaining store
- Growth cannot operate, compare, or consolidate more than one store
- Growth cannot initiate a stock transfer or report transfers
- consolidated receivables, consolidated payables, and branch comparison stay Pro-only

Several retained `Store` rows are not by themselves a defect. The defect is more than one active operational store on Starter or Growth, a cross-store operation, a cross-store comparison, a consolidated analytic, inferring “the first store”, or opening another store without a valid store context.

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
- Gross profit for a chosen record period in calculation state `READY` or `INCOMPLETE_COSTS` (`margin.line.v1`). “Hidden until costs set” is presentation of `INCOMPLETE_COSTS`, not a third state.
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

### Growth schedule (frozen)

Growth sends **exactly one** daily owner summary.

- Channel: **SMS only**. The current outbox insert already sets `channel: 'SMS'` (`lib/notifications/owner-daily-summary-sms.ts`).
- Recipients: **one verified owner destination**.
- No WhatsApp send for this summary. Do not add WhatsApp routes, tests, UI, copy, or provider stubs for it. WhatsApp is not the Growth schedule. Provider modules under `lib/notifications/providers/` are out of scope and are not evidence that this summary is a WhatsApp product.
- No monthly management pack on Growth.
- No external recipient list.
- The cron path must apply the same Growth plan check as settings. It does not, on `b6e4bc8` (Pass A §6).

The earlier draft “1 monthly email summary” and the earlier note that allowed WhatsApp are withdrawn. The outbox channel on `b6e4bc8` is SMS. The recipient helper currently prefers `whatsappPhone` before `phone`; the frozen destination is one verified owner SMS number, not a WhatsApp identity.

### Growth SMS payload (formatter specified, not built)

Future formatter lives beside `buildOwnerDailySummarySms`. Future tests live in `lib/notifications/owner-daily-summary-sms.contract.test.ts`. Neither file change is part of this close-out.

Windows use `Business.timezone` and the half-open clock in `REPORT_CATALOGUE.md`.

Default freshness sentence, required:

`Based on data received by TillFlow as of [YYYY-MM-DD HH:mm] [Business.timezone].`

Do not say “All synced” unless a reliable acknowledgement proves it. Do not say “Syncing N” unless the server knows N.

Open expected cash and closed variance are separate. Never one combined cash figure.

Maximum size: **two concatenated GSM-7 segments**.

- GSM-7 only. A character outside the GSM-7 default alphabet, or an extension-table character (`^ { } \ [ ~ ] | €`, each counting as two septets), is forbidden. Do not fall forward to UCS-2.
- One segment is 160 septets. A concatenated segment carries a 7-septet header, so each segment holds 153 septets. Two segments hold **306 septets**.
- Currency token is `GHS`. Do not use `GH₵`. The current helper already rewrites `GH₵` to `GHS ` in `money()`; the frozen text uses `GHS` without relying on that rewrite.

Core, in this priority, never removed:

1. the freshness sentence
2. recognised sales today and the transaction count
3. confirmed money received total
4. overdue customer balance total
5. overdue supplier balance total
6. open-shift expected physical cash, only when an open shift exists
7. unresolved or latest closed-shift variance, labelled closed
8. expenses paid today

Items 6–8 are core when they exist, and they are the first cash and expense lines. They are not dropped in the overflow list below except as the cash rule at the end states.

Conditional, only when they fit:

- Gross profit only when `margin.line.v1` is `READY`.
- When costs are `INCOMPLETE_COSTS`, do not send a GP figure. A short incomplete-cost warning is allowed only if it fits.
- Payment-method split only if it fits.
- At most three priority actions, and only if they fit. The ladder is the Owner Today ladder.

If the payload is over 306 septets, drop or compress in this order:

1. Remove the payment-method split. Keep the confirmed money received total.
2. Remove GP or the incomplete-cost warning.
3. Reduce priority actions from up to three to one.
4. Replace the remaining action text with `N actions need review`.
5. Shorten with only these abbreviations: `transactions` → `tx`; `Confirmed money received` → `Received`; `Overdue customers` → `Cust overdue`; `Overdue suppliers` → `Sup overdue`; `Open expected cash` → `Open cash`; `Closed variance` → `Closed var`; `Expenses paid` → `Exp paid`; `Gross profit` → `GP`. The freshness sentence may become `As of [YYYY-MM-DD HH:mm] [timezone]. Data received by TillFlow.`

Never drop the freshness meaning, sales and transaction count, confirmed money received total, overdue customer total, or overdue supplier total.

If a conditional cash line would still force a third segment: keep an unresolved closed variance and omit open expected cash. The omitted cash figure is available in the authenticated app, not in a third SMS segment. If the protected core still exceeds 306 septets after the abbreviations, do not send. The in-app summary remains.

Future tests, not written now:

- protected core fits in 306 GSM-7 septets and contains freshness, sales, transaction count, received total, and both overdue totals
- the body contains `GHS` and does not contain `GH₵`
- a non-GSM-7 character is rejected and is not sent as UCS-2
- over 306 septets drops the method split first and still contains the received total
- `INCOMPLETE_COSTS` sends no GP amount
- `READY` may include GP when it fits
- the drop order matches the five steps
- open cash and closed variance are not merged
- a third segment is never produced

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

### Pro v1 recipient caps (frozen integers)

These change only by a numbered contract amendment.

| Cadence | Maximum unique verified recipients per business |
|---|---|
| Daily | 3 |
| Weekly | 5 |
| Monthly | 10 |

The cap is across all active schedules of that cadence, not per report. Each recipient is explicitly authorised. An alias or a distribution list does not add capacity. A removed or failed destination does not keep consuming a seat. On downgrade, excess schedules are disabled in a deterministic order (newest schedule first) and are not deleted. Schedule configuration and delivery history remain.

Channel for Pro packs: email and in-app. Not WhatsApp. Not the Growth SMS.

---

## Side-by-side

| | Starter | Growth | Pro |
|---|---|---|---|
| Stores in reports | 1 | 1 | Many + consolidated |
| Record history | Any date stored | Any date stored | Any date stored |
| Trend | Today + 30 daily points of sales and money received | 13 months | Retained history |
| Period compare | 0 | 2 periods inside 13 months | Any 2 in retained history |
| Saved views | 0 | 5 | 25 |
| Schedules | 0 | 1 daily owner SMS, 1 verified destination | Daily / weekly / monthly packs, caps 3 / 5 / 10 |
| Staff activity | No | Yes, permitted managers | Yes, permitted managers |
| Branch comparison | No | No | Yes |
| Transfers in reports | No | No | Yes, if the feature is on |
| GP view | Yes, `READY` or `INCOMPLETE_COSTS` | Yes, plus trends inside 13 months | Yes, plus branch dimension |

Downgrade behaviour is in `REPORT_ACCESS_AND_EXPORT_CONTRACT.md`. Nothing in this matrix deletes rows.
