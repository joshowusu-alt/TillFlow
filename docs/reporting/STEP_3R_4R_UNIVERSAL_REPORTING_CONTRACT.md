# 1. Executive repair verdict

Step 3R.4R recovers TillFlow’s Universal Reporting Contract from the complete Step 3R.2 base plus the explicit Step 3R.3 and Step 3R.4 correction records after the complete Step 3R.3 source file proved unavailable. Settled economic rules are preserved. Structural defects targeted by those corrections are repaired: independent Metric ID definitions, single-outcome conformance tests, customer-obligation economics for CT25, and raw-Markdown table structure.

Present TillFlow does not yet execute partial-return line allocation, damaged-return disposition, payment-reversal ledgers, sale-completion settlement identity for paid-at-sale, expense incurred dates, customer-credit/payable ledgers, revision-stamped cache reconciliation, or immutable weekly-digest snapshots. Those capabilities remain dependency-gated and must not be treated as currently supported.

Highest residual trust risks: parent-invoice filters still excluding historical receipts from some Money Received queries (`lib/reports/weekly-digest.ts`, `lib/reports/today-kpis.ts`); ambiguous zero versus missing cost (`SalesInvoiceLine.lineCostPence` default 0; `lib/reports/financials.ts` defaultCost fallback); live Weekly Digest mistaken for an immutable snapshot (`lib/reports/weekly-digest.ts` `unstable_cache`); tax-inclusive totals confused with ex-tax revenue.

Reserved decisions remain: Manager Gross Profit access; tax label preference; digest freeze policy; overdue-shift hours threshold; unusual-refund threshold; dueDate legal source if contractual dueDate is incomplete.

This raw Markdown contract passed the executed deterministic validator (`docs/reporting/validate-step-3r4r.js`), which printed `VALIDATION PASSED`. Table structure, Metric ID completeness, conformance-test structure, and document-boundary gates were checked by that executed run rather than by assertion alone.

# 2. Evidence boundary

Recovery evidence set for this contract:

| Source | Version | Authority |
| --- | --- | --- |
| Conversation transcript complete Step 3R.2 contract | feat/mobile-parity-p2 @ e14cf8cde0144e5715d51550d1524c3f622025b8 | Settled economic base |
| User Step 3R.3 correction instructions | 2026-08-09 formal correction record | Mandatory mechanical and conformance corrections |
| Partial Step 3R.3 assistant fragments | Truncated conversation outputs | Supplementary Metric ID extras only where explicit |
| User Step 3R.4 / 3R.4R repair instructions | 2026-08-10 / 2026-08-11 | Highest authority for structural repair rules |
| TillFlow repository focused checks | prisma/schema.prisma; lib/services/returns.ts; lib/reports/* | Present-support classification only |

Inspected commit for implementation claims: `feat/mobile-parity-p2` @ `e14cf8cde0144e5715d51550d1524c3f622025b8`.

Evidence classes used on material claims: Confirmed implementation fact; Strong repository inference; Proposed universal rule; Requires product decision; Requires accounting decision; Requires runtime verification; Requires customer evidence.

Repository implementation evidence classifies present support. It does not override the canonical future economic contract.

Known incompleteness: complete Step 3R.3 standalone file absent; recovery uses Step 3R.2 plus explicit correction records rather than a lost full 3R.3 document.

# 3. Universal reporting invariants

1. One Metric ID maps to exactly one name, formula, population, timestamp, tax basis, scope rule, aggregation class, quality rule, correction treatment, and drill-down grain.
2. Business timezone and half-open period bounds `[start, end)` govern classification.
3. Sales, Money Received, drawer cash, profitability, and formal accounting results remain distinct.
4. A confirmed historical receipt remains in its original activity period after later return, refund, void, reversal, or sale-status change.
5. Failed, cancelled, abandoned, and unknown-status payments are never confirmed Money Received.
6. Refunds and payment reversals are separate effective-dated events with separate Metric IDs.
7. Returns and refunds are distinct; either may occur without the other.
8. Later credit collections increase Money Received and reduce receivables; they do not increase current-period Sales.
9. Inventory purchases do not create immediate COGS or operating expenses.
10. Supplier payments do not create operating expense merely because cash moved.
11. Expense recognition and expense payment are distinct.
12. `gross_profit_complete` requires 100 percent reliable cost coverage.
13. Profit on costed sales only uses a separate Metric ID and must not be labelled complete Gross Profit.
14. Genuine zero cost requires provenance EXPLICIT_ZERO.
15. Missing cost is never treated as zero.
16. Estimates cannot be labelled canonical Gross Profit.
17. Current-restated metrics and action-period activity metrics never share one Metric ID.
18. Restatement requires a stored comparison baseline.
19. Delivered snapshots are identifiable and immutable.
20. Subscription level cannot change basic reporting truth.
21. Current-restated trading amounts use sale-line and returned-quantity allocation; whole-invoice RETURNED status alone cannot compute a partial return.
22. Paid-at-sale uses the sale-completion cut-off instant; end of business day is not the cut-off.
23. Due status and overdue ageing are separate dimensions; unknown due dates are never assigned into current or overdue buckets.
24. Cached headlines may claim reconciliation to detail only when Metric ID, definitionVersion, scope, timezone, period or asOf, sourceRevision, and calculationRevision are compatible.
25. Staleness must not be excused as rounding.
26. Dependency-gated metrics are UNAVAILABLE UNTIL DEPENDENCY RESOLVED and must not display fabricated canonical values.
27. Page-specific exceptions are non-compliant.

---

# 4. Scope and business-clock contract

| Contract area | Final rule | Authoritative source or time | Missing or legacy treatment | Drill-down requirement | Evidence or policy status |
| --- | --- | --- | --- | --- | --- |
| Business | Always one business per calculation | businessId | Reject orphans | Always show | Confirmed implementation fact |
| Timezone | Business.timezone; invalid or null falls back to Africa/Accra | schema Business.timezone; DEFAULT_BUSINESS_TIMEZONE | Fallback Accra | Show timezone | Confirmed field; many reports still use server-local day bounds; conflict |
| Period | Half-open UTC instants for business-local [D_start, D_end+1) | Convert authoritative timestamps into business TZ | None | Inherit exact bounds | Proposed universal rule |
| Today week month quarter year | Business-local civil calendar; weekStartsOn default Monday configurable | Business settings when present | Default Monday | Inherit | Digest hard-codes server-local Monday; conflict |
| Point-in-time asOf | Instant interpreted in business TZ | asOf | None | Show asOf | Proposed universal rule |
| Sale recognition time for period membership | SalesInvoice.createdAt until saleCompletedAt exists | createdAt | Disclose provisional | Show sale datetime | Confirmed createdAt usage |
| Sale-completion cut-off for paid-at-sale | Checkout finalisation instant saleCompletedAt | saleCompletedAt | Metric UNAVAILABLE UNTIL DEPENDENCY until field and settlement link exist | Show cut-off and settlement link | Proposed; no saleCompletedAt in schema today |
| Receipt time | SalesPayment.receivedAt | receivedAt | Unknown status goes to unverified metric | Show receivedAt | Confirmed schema.prisma SalesPayment |
| Refund effective time | refundEffectiveAt; currently SalesReturn.createdAt when amount stored on return | Return createdAt | None for whole-sale refunds | Show return id | Confirmed returns.ts |
| Reversal effective time | reversalEffectiveAt on reversal record | Reversal record | UNAVAILABLE UNTIL DEPENDENCY | Show reversal id and original payment id | Proposed |
| Return effective time | returnEffectiveAt; currently SalesReturn.createdAt | Return createdAt | Partial returns gated | Show return and return-line ids | Confirmed whole-sale; partial gated |
| Expense recorded time | Expense.createdAt | createdAt | Disclose recorded-date basis | Show | Confirmed; no incurredAt |
| Expense paid time | ExpensePayment.paidAt | paidAt | None | Show | Confirmed |
| Contractual due date | Invoice or bill dueDate | dueDate | DUE_DATE_UNKNOWN | Show dueDate | Confirmed optional SalesInvoice.dueDate |
| Shift bounds | openedAt to closedAt; may span midnight | Shift | Open shifts have no declared cash | Shift id for drawer | Confirmed Shift model |
| Branch till user | Optional filters; All means all in business | storeId tillId cashierUserId | Unattributed bucket | Inherit when set | Confirmed |
| Currency | One business currency; integer minor units; no cross-currency consolidation | Business.currency | Mixed currencies UNAVAILABLE | Inherit | Confirmed |
| Timezone change | Live uses current business TZ; snapshots embed TZ at generation | Snapshot payload | None | Snapshot shows embedded TZ | Proposed |

---

# 5. Canonical metric dictionary

Every Metric ID below is independently defined. No Metric ID inherits a family profile. Support classifications use only CURRENTLY SUPPORTED; PARTIALLY SUPPORTED — NON-CANONICAL; or UNAVAILABLE UNTIL DEPENDENCY RESOLVED. A non-canonical approximation must never be labelled as the canonical Metric ID result.

Line-return allocation fields required for restated trading: originating sale ID; originating sale-line ID; return event ID; returned quantity; recognised return value; allocated gross; allocated discount; allocated net sales incl tax; allocated tax when stored tax components exist on the line; allocated revenue excl tax when lineSubtotal components exist on the line; immutable sale-time unit cost; cost correction reference if any; returnEffectiveAt; inventory disposition; refund relationship if any. Partial return reduces only the allocated portion; the unreturned portion remains recognised; header RETURNED status cannot substitute for return-line allocation; refund value does not determine merchandise return value.

## 5.1 gross_sales_incl_tax_restated — Gross Sales Restated incl tax

| Attribute | Definition |
| --- | --- |
| Metric ID | gross_sales_incl_tax_restated |
| Canonical name | Gross Sales Restated incl tax |
| Business question | What ticketed gross remains recognised for the sale period as of asOf after valid return allocations? |
| Metric type | FLOW |
| Event or balance population | Eligible completed sale lines whose originating SalesInvoice.createdAt falls in the requested sale period and that retain allocated gross after valid return allocations known by asOf. |
| Inclusion and exclusion rules | Include retained allocated gross after returns. Exclude VOID sales. Exclude returned quantity portions. Do not use header RETURNED status alone to compute partials. |
| Status treatment | VOID sales excluded from restated population. Fully returned lines contribute zero retained gross. Partially returned lines contribute only the retained allocation. |
| Exact canonical formula | SUM over eligible sale lines of allocated_gross_after_returns(line, asOf). |
| Authoritative timestamp or asOf rule | Sale createdAt determines period membership; return allocations evaluated at asOf. |
| Period attribution | Attributed to the originating sale period of the invoice createdAt, restated as of asOf. |
| Restates originating transaction | Yes; restates originating sale gross to the retained allocated amount after returns known by asOf. |
| Reports action-period activity | No; does not report return-period activity; use returns_incl_tax_activity for action-period returns. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Decreases when valid returns allocate against the line; never increases because of later collections. |
| Receivable or customer-obligation effect | Indirect only through the economic link between restated charges and open receivable; this Metric ID itself is not an AR balance. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | Feeds Gross Profit inputs only through companion revenue and cost metrics; this ID is not Gross Profit. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE only when every retained line has a deterministic allocation grain. Otherwise INCOMPLETE or UNAVAILABLE UNTIL DEPENDENCY RESOLVED. |
| Correction and restatement treatment | Later valid returns known by asOf restate this figure for the originating period; historical activity Metric IDs remain unchanged. |
| Drill-down grain | Sale invoice, sale line, return allocation lines, allocated gross components. |
| Reconciliation relationship | Must reconcile to the sum of drill-down allocated_gross_after_returns rows for the same scope and asOf. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-RET-1 sale-line and returned-quantity allocation grain; whole-invoice RETURNED is a non-canonical approximation and must not be labelled as this Metric ID |
| Material-claim classification | Proposed universal rule |

## 5.2 discounts_incl_tax_restated — Discounts Restated incl tax

| Attribute | Definition |
| --- | --- |
| Metric ID | discounts_incl_tax_restated |
| Canonical name | Discounts Restated incl tax |
| Business question | What discount remains allocated to retained quantities for the sale period as of asOf? |
| Metric type | FLOW |
| Event or balance population | Eligible sale lines in the sale period with allocated discount remaining after valid return allocations asOf. |
| Inclusion and exclusion rules | Include allocated discount on retained quantities. Exclude discounts on fully returned quantities. Exclude VOID sales. |
| Status treatment | Follows sale and return allocation status; VOID excluded; fully returned lines contribute zero retained discount. |
| Exact canonical formula | SUM over eligible sale lines of allocated_discount_after_returns(line, asOf). |
| Authoritative timestamp or asOf rule | Sale createdAt for period membership; allocations evaluated at asOf. |
| Period attribution | Attributed to the originating sale period; restated as of asOf. |
| Restates originating transaction | Yes; restates originating discount to retained allocations after returns known by asOf. |
| Reports action-period activity | No; action-period discount overrides use discount_override_count. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Reduces net sales components when present on retained quantities. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when discount allocations exist at line grain; otherwise INCOMPLETE or UNAVAILABLE UNTIL DEPENDENCY RESOLVED. |
| Correction and restatement treatment | Restates with return allocations; does not rewrite historical activity totals. |
| Drill-down grain | Sale line and allocated discount after returns. |
| Reconciliation relationship | Sum of drill-down allocated discounts equals the headline for the same asOf and scope. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-RET-1 sale-line return allocation grain |
| Material-claim classification | Proposed universal rule |

## 5.3 net_sales_before_returns_incl_tax — Net Sales Before Returns incl tax

| Attribute | Definition |
| --- | --- |
| Metric ID | net_sales_before_returns_incl_tax |
| Canonical name | Net Sales Before Returns incl tax |
| Business question | What was the invoice net incl tax at sale before later returns, attributed to the original activity period? |
| Metric type | FLOW |
| Event or balance population | Non-VOID SalesInvoice records with createdAt in the requested period. |
| Inclusion and exclusion rules | Include all non-VOID completed sale invoices in period by createdAt. Exclude VOID. Do not reduce for later returns in this Metric ID. |
| Status treatment | VOID excluded. RETURNED parent invoices remain visible in this historical activity Metric ID for their original period. |
| Exact canonical formula | SUM SalesInvoice.totalPence for non-VOID sales with createdAt in period. |
| Authoritative timestamp or asOf rule | SalesInvoice.createdAt. |
| Period attribution | Original activity period of the sale; later returns do not move this amount out of the period. |
| Restates originating transaction | No; this is original-period historical activity and is not restated by later returns. |
| Reports action-period activity | Yes; reports original sale-period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Records original ticketed net sales activity; companion restated Metric IDs handle current recognition. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when invoice totals exist. Relative to formal tax-exclusive revenue this remains an incl-tax ops total. |
| Correction and restatement treatment | Immutable as historical activity; corrections that change the original invoice require an authorised correction event, not silent overwrite without audit. |
| Drill-down grain | SalesInvoice grain with totalPence and createdAt. |
| Reconciliation relationship | Sum of invoice totals in drill-down equals the headline for the period and scope. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.4 net_sales_incl_tax_restated — Net Sales Restated incl tax

| Attribute | Definition |
| --- | --- |
| Metric ID | net_sales_incl_tax_restated |
| Canonical name | Net Sales Restated incl tax |
| Business question | Based on all valid returns known by asOf, what net sales incl tax remain recognised for the originating sale period? |
| Metric type | FLOW |
| Event or balance population | Sale lines with originating createdAt in period, after subtracting cumulative valid returned net incl tax allocated by asOf. |
| Inclusion and exclusion rules | Include retained net after return allocations. Exclude VOID. Exclude returned allocated portions. Do not treat header RETURNED as a partial calculator. |
| Status treatment | Fully returned sales contribute zero retained net. Partial returns reduce only allocated portions. |
| Exact canonical formula | SUM over sale lines in period of (original_line_net_incl_tax minus cumulative_valid_returned_net_incl_tax(line, asOf)). |
| Authoritative timestamp or asOf rule | Sale createdAt for membership; return allocations at asOf. |
| Period attribution | Originating sale period, restated as of asOf. |
| Restates originating transaction | Yes; restates originating net sales after returns known by asOf. |
| Reports action-period activity | No; return action-period value is returns_incl_tax_activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Current recognised net sales for the originating period after returns. |
| Receivable or customer-obligation effect | Aligns economically with charge reductions that clear receivable on returned merchandise. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE only with line-return allocation. Whole-invoice RETURNED approximation is non-canonical and must not be labelled as this Metric ID. |
| Correction and restatement treatment | Restates when later valid returns become known by asOf; historical net_sales_before_returns_incl_tax unchanged. |
| Drill-down grain | Sale line, return allocation, original and returned net components. |
| Reconciliation relationship | Headline equals sum of retained line nets in drill-down for same asOf and scope. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-RET-1 sale-line and returned-quantity allocation grain |
| Material-claim classification | Proposed universal rule |

## 5.5 returns_incl_tax_activity — Return Activity incl tax

| Attribute | Definition |
| --- | --- |
| Metric ID | returns_incl_tax_activity |
| Canonical name | Return Activity incl tax |
| Business question | What merchandise return value occurred in the action period? |
| Metric type | FLOW |
| Event or balance population | Recognised merchandise return events with returnEffectiveAt in the action period. |
| Inclusion and exclusion rules | Include recognised return merchandise value. Exclude failed or unauthorised return attempts. Refund amount does not determine this value. |
| Status treatment | Only authorised completed return events. Whole-sale returns currently modelled as one return per invoice. |
| Exact canonical formula | SUM recognised return merchandise value where returnEffectiveAt is in period. |
| Authoritative timestamp or asOf rule | returnEffectiveAt (authoritative return effective time). |
| Period attribution | Action period of the return, not the original sale period. |
| Restates originating transaction | No; this reports action-period return activity. Restatement effects appear on restated sales Metric IDs. |
| Reports action-period activity | Yes; action-period return activity. |
| Money-movement effect | None by itself; refund_outflows is separate. |
| Sales effect | Does not itself rewrite historical activity; drives reductions on restated sales Metric IDs. |
| Receivable or customer-obligation effect | Return of unpaid charge reduces receivable; under-refund creates customer_credit_payable separately. |
| Inventory effect | Companion inventory Metric IDs record saleable or damaged disposition. |
| COGS effect | Companion COGS restatement or damaged write-off Metric IDs apply. |
| Gross Profit or expense effect | Affects Gross Profit through companion cost and revenue restatements. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL for whole-sale returns only; partial line returns require DEP-RET-1. |
| Correction and restatement treatment | Once posted, return activity remains in its effective period; corrections use authorised reversal of return events. |
| Drill-down grain | Return event, originating sale, sale lines, disposition, linked refund if any. |
| Reconciliation relationship | Sum of return merchandise values in drill-down equals headline for period and scope. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-RET-1 for partial returns; whole-sale path exists via SalesReturn |
| Material-claim classification | Confirmed implementation fact |

## 5.6 sales_tax_restated — Sales Tax Restated

| Attribute | Definition |
| --- | --- |
| Metric ID | sales_tax_restated |
| Canonical name | Sales Tax Restated |
| Business question | What tax remains on restated recognised sales for the sale period as of asOf? |
| Metric type | FLOW |
| Event or balance population | Retained sale-line portions in period with stored tax components after return allocations asOf. |
| Inclusion and exclusion rules | Include allocated remaining tax components. Exclude invented splits when components are missing. |
| Status treatment | Follows restated recognition status of the parent line portions. |
| Exact canonical formula | SUM allocated tax remaining on retained line portions where tax components exist. |
| Authoritative timestamp or asOf rule | Sale period membership by createdAt; allocations at asOf. |
| Period attribution | Originating sale period restated as of asOf. |
| Restates originating transaction | Yes; restates tax on retained portions after returns known by asOf. |
| Reports action-period activity | No; does not report action-period tax activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Tax component of restated sales; not a substitute for revenue_excl_tax_restated. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Uses stored tax components where present; if components are missing the metric is INCOMPLETE or UNAVAILABLE rather than inventing an allocation. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | INCOMPLETE or UNAVAILABLE when tax components are missing; do not invent allocations. |
| Correction and restatement treatment | Restates with return allocations when tax components exist. |
| Drill-down grain | Sale line tax components and return allocations. |
| Reconciliation relationship | Sum of component rows equals headline when COMPLETE. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-RET-1 for partial allocations; tax component completeness on lines |
| Material-claim classification | Strong repository inference |

## 5.7 revenue_excl_tax_restated — Revenue Restated excl tax

| Attribute | Definition |
| --- | --- |
| Metric ID | revenue_excl_tax_restated |
| Canonical name | Revenue Restated excl tax |
| Business question | What formal ex-tax revenue remains recognised for the sale period as of asOf? |
| Metric type | FLOW |
| Event or balance population | Retained lineSubtotal amounts after return allocations for sale lines in period. |
| Inclusion and exclusion rules | Include retained ex-tax line subtotals. Exclude tax components. Exclude VOID and returned portions. |
| Status treatment | Follows restated recognition after returns. |
| Exact canonical formula | SUM lineSubtotal remaining after return allocations asOf for lines in period. |
| Authoritative timestamp or asOf rule | Sale createdAt membership; asOf allocations. |
| Period attribution | Originating sale period restated as of asOf. |
| Restates originating transaction | Yes; restates formal ex-tax revenue after returns known by asOf. |
| Reports action-period activity | No; does not report action-period revenue activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Formal ex-tax revenue recognition for the period after returns. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | Primary revenue input to gross_profit_complete and gross_profit_on_costed_sales. |
| Tax basis | Tax-exclusive revenue components only; do not invent tax splits from inclusive totals. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE only with reliable lineSubtotal and return allocation grain. |
| Correction and restatement treatment | Restates with returns; historical activity Metric IDs unchanged. |
| Drill-down grain | Sale line subtotals and return allocations. |
| Reconciliation relationship | Sum of retained lineSubtotals equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-RET-1 sale-line return allocation grain |
| Material-claim classification | Proposed universal rule |

## 5.8 voids_count_activity — Void Count Activity

| Attribute | Definition |
| --- | --- |
| Metric ID | voids_count_activity |
| Canonical name | Void Count Activity |
| Business question | How many voids were executed in the action period? |
| Metric type | COUNT |
| Event or balance population | Void events with void effective time in period. |
| Inclusion and exclusion rules | Include authorised void executions. Exclude non-void status changes. |
| Status treatment | Counts void events only. |
| Exact canonical formula | COUNT void events by void effective time in period. |
| Authoritative timestamp or asOf rule | Void effective time. |
| Period attribution | Action period of the void. |
| Restates originating transaction | No; voids are action-period events, not restatements of prior periods. |
| Reports action-period activity | Yes; reports action-period void count. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Companion voids_value_incl_tax_activity carries value; restated sales exclude voided sales. |
| Receivable or customer-obligation effect | Void clears related open receivable per void rules. |
| Inventory effect | Void path may reverse stock depending on void workflow. |
| COGS effect | Void reverses related recognised COGS where applicable. |
| Gross Profit or expense effect | Removes related GP through companion restatements. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL if void time is only invoice createdAt. |
| Correction and restatement treatment | Activity remains in void effective period. |
| Drill-down grain | Void event and originating sale. |
| Reconciliation relationship | Count of void rows equals headline. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Strong repository inference |

## 5.9 voids_value_incl_tax_activity — Void Value Activity incl tax

| Attribute | Definition |
| --- | --- |
| Metric ID | voids_value_incl_tax_activity |
| Canonical name | Void Value Activity incl tax |
| Business question | What merchandise value was voided in the action period? |
| Metric type | FLOW |
| Event or balance population | Voided merchandise amounts with void effective time in period. |
| Inclusion and exclusion rules | Include voided merchandise value. Exclude ordinary returns and refunds. |
| Status treatment | Void events only. |
| Exact canonical formula | SUM voided merchandise value at void effective time. |
| Authoritative timestamp or asOf rule | Void effective time. |
| Period attribution | Action period of the void. |
| Restates originating transaction | No; voids are action-period value events. |
| Reports action-period activity | Yes; reports action-period void value. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Removes recognition via restated companions; this ID is action-period void value. |
| Receivable or customer-obligation effect | Clears related receivable per void rules. |
| Inventory effect | Per void workflow inventory effects are recorded on companion stock Metric IDs. |
| COGS effect | Reverses related COGS where applicable. |
| Gross Profit or expense effect | Affects GP via companions. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL if void timestamp equals invoice createdAt only. |
| Correction and restatement treatment | Remains in void effective period. |
| Drill-down grain | Void event and value components. |
| Reconciliation relationship | Sum of void values equals headline. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Strong repository inference |

## 5.10 transactions_restated — Transactions Restated

| Attribute | Definition |
| --- | --- |
| Metric ID | transactions_restated |
| Canonical name | Transactions Restated |
| Business question | How many currently retained completed transactions remain in the sale period as of asOf? |
| Metric type | COUNT |
| Event or balance population | Sales with createdAt in period that retain at least one positive recognised unit after return allocations asOf. |
| Inclusion and exclusion rules | Count 1 for a partially returned sale that still has retained units. Count 0 for a fully returned sale. Exclude VOID. |
| Status treatment | Based on retained units after returns, not header status alone. |
| Exact canonical formula | COUNT sales with createdAt in period that retain at least one positive recognised unit after return allocations asOf. |
| Authoritative timestamp or asOf rule | Sale createdAt; allocations asOf. |
| Period attribution | Originating sale period restated as of asOf. |
| Restates originating transaction | Yes; count reflects retained transactions after returns known by asOf. |
| Reports action-period activity | No; does not report action-period transaction opens. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Count companion to restated sales value Metric IDs. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE only with return allocation grain. |
| Correction and restatement treatment | Restates with returns known by asOf. |
| Drill-down grain | Sales retaining positive units. |
| Reconciliation relationship | Count of qualifying sales equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-RET-1 sale-line return allocation grain |
| Material-claim classification | Proposed universal rule |

## 5.11 units_sold_restated — Units Sold Restated

| Attribute | Definition |
| --- | --- |
| Metric ID | units_sold_restated |
| Canonical name | Units Sold Restated |
| Business question | How many units remain recognised for the sale period as of asOf? |
| Metric type | COUNT |
| Event or balance population | Sale lines in period after subtracting cumulative returned qty asOf. |
| Inclusion and exclusion rules | Include retained qtyBase. Exclude returned quantities. Exclude VOID. |
| Status treatment | Follows return allocations. |
| Exact canonical formula | SUM (original qtyBase minus cumulative returned qty asOf) for lines in period. |
| Authoritative timestamp or asOf rule | Sale membership by createdAt; asOf allocations. |
| Period attribution | Originating sale period restated as of asOf. |
| Restates originating transaction | Yes; restates retained units after returns known by asOf. |
| Reports action-period activity | No; does not report action-period unit movements. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Quantity companion to restated sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | Multiplier base for cogs_restated with immutable sale-time unit cost. |
| Gross Profit or expense effect | Affects GP through COGS and revenue companions. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE only with return quantity allocation. |
| Correction and restatement treatment | Restates with returns. |
| Drill-down grain | Sale line quantities and return quantities. |
| Reconciliation relationship | Sum of retained quantities equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-RET-1 sale-line returned-quantity allocation |
| Material-claim classification | Proposed universal rule |

## 5.12 avg_sale_value_restated — Average Sale Value Restated

| Attribute | Definition |
| --- | --- |
| Metric ID | avg_sale_value_restated |
| Canonical name | Average Sale Value Restated |
| Business question | What is the typical retained basket value for the sale period as of asOf? |
| Metric type | RATIO |
| Event or balance population | Derived from net_sales_incl_tax_restated and transactions_restated for the shared scope and asOf. |
| Inclusion and exclusion rules | Defined only when transactions_restated is greater than zero. |
| Status treatment | Unavailable when denominator is zero. |
| Exact canonical formula | net_sales_incl_tax_restated / transactions_restated. |
| Authoritative timestamp or asOf rule | Derived from component Metric IDs. |
| Period attribution | Matching originating sale period and asOf as components. |
| Restates originating transaction | Yes; derived from restated components. |
| Reports action-period activity | No; derived ratio is not action-period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Ratio of restated sales metrics. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | RATIO |
| Data-quality requirement | UNAVAILABLE if transactions_restated is 0; otherwise inherits component quality. |
| Correction and restatement treatment | Recomputes when components restate. |
| Drill-down grain | Component sales and transaction rows. |
| Reconciliation relationship | Must equal component division for the shared scope. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-RET-1 via component restated metrics |
| Material-claim classification | Proposed universal rule |

## 5.13 avg_units_per_transaction_restated — Avg Units per Transaction Restated

| Attribute | Definition |
| --- | --- |
| Metric ID | avg_units_per_transaction_restated |
| Canonical name | Avg Units per Transaction Restated |
| Business question | What is the average retained units per retained transaction for the sale period as of asOf? |
| Metric type | RATIO |
| Event or balance population | Derived from units_sold_restated and transactions_restated. |
| Inclusion and exclusion rules | Defined only when transactions_restated is greater than zero. |
| Status treatment | Unavailable when denominator is zero. |
| Exact canonical formula | units_sold_restated / transactions_restated. |
| Authoritative timestamp or asOf rule | Derived from component Metric IDs. |
| Period attribution | Matching period and asOf as components. |
| Restates originating transaction | Yes; derived from restated components. |
| Reports action-period activity | No; derived ratio is not action-period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Ratio of restated unit and transaction metrics. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | RATIO |
| Data-quality requirement | UNAVAILABLE if transactions_restated is 0; otherwise inherits component quality. |
| Correction and restatement treatment | Recomputes when components restate. |
| Drill-down grain | Component unit and transaction rows. |
| Reconciliation relationship | Must equal component division. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-RET-1 via component restated metrics |
| Material-claim classification | Proposed universal rule |

## 5.14 pending_order_count — Pending Order Count

| Attribute | Definition |
| --- | --- |
| Metric ID | pending_order_count |
| Canonical name | Pending Order Count |
| Business question | How many online orders are pending fulfillment as of asOf? |
| Metric type | COUNT |
| Event or balance population | OnlineOrder records with fulfillmentStatus PENDING and not cancelled at asOf. |
| Inclusion and exclusion rules | Include PENDING not cancelled. Exclude fulfilled, cancelled, and other terminal states. |
| Status treatment | Uses OnlineOrder.fulfillmentStatus. |
| Exact canonical formula | COUNT OnlineOrder with fulfillmentStatus PENDING and not cancelled at asOf. |
| Authoritative timestamp or asOf rule | Point-in-time asOf. |
| Period attribution | Point-in-time balance/count; not a period flow. |
| Restates originating transaction | No; pending orders are live asOf state. |
| Reports action-period activity | No; not an action-period flow total. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Not recognised sales until completed sale rules apply. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | DISTINCT_COUNT |
| Data-quality requirement | COMPLETE when OnlineOrder fulfillmentStatus is authoritative. |
| Correction and restatement treatment | Live asOf; no snapshot unless exported as snapshot_value. |
| Drill-down grain | OnlineOrder rows. |
| Reconciliation relationship | Count of qualifying orders equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.15 pending_order_value_incl_tax — Pending Order Value incl tax

| Attribute | Definition |
| --- | --- |
| Metric ID | pending_order_value_incl_tax |
| Canonical name | Pending Order Value incl tax |
| Business question | What is the value of pending online orders as of asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Pending OnlineOrder population at asOf. |
| Inclusion and exclusion rules | Include pending order totals. Exclude cancelled and fulfilled. |
| Status treatment | Pending only. |
| Exact canonical formula | SUM order totals for the pending OnlineOrder population at asOf. |
| Authoritative timestamp or asOf rule | asOf. |
| Period attribution | Point-in-time. |
| Restates originating transaction | No; pending order value is live asOf state. |
| Reports action-period activity | No; not an action-period flow total. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Not completed sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL until order total field semantics are confirmed for all channels. |
| Correction and restatement treatment | Live asOf. |
| Drill-down grain | OnlineOrder value fields. |
| Reconciliation relationship | Sum of order totals equals headline. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Strong repository inference |

## 5.16 paid_at_sale_value_incl_tax — Paid-at-Sale Value incl tax

| Attribute | Definition |
| --- | --- |
| Metric ID | paid_at_sale_value_incl_tax |
| Canonical name | Paid-at-Sale Value incl tax |
| Business question | What portion of eligible completed sales was settled by confirmed payments no later than sale completion and part of that checkout settlement? |
| Metric type | FLOW |
| Event or balance population | Eligible completed sales with saleCreatedAt in period and known saleCompletedAt, with CONFIRMED payments allocated to the checkout settlement. |
| Inclusion and exclusion rules | Include only CONFIRMED payments allocated to the checkout settlement with paymentConfirmedAt less than or equal to saleCompletedAt. Exclude payments after saleCompletedAt. Do not use business-day end as a cut-off substitute. |
| Status treatment | CONFIRMED payments only for the settlement allocation; VOID sales excluded. |
| Exact canonical formula | SUM over eligible sales of min(sale_total, sum of CONFIRMED payments allocated to the checkout settlement with paymentConfirmedAt <= saleCompletedAt). |
| Authoritative timestamp or asOf rule | saleCompletedAt is the authoritative cut-off; sale createdAt for period membership. End of business day must not be used. |
| Period attribution | Attributed to the originating sale period by sale createdAt. |
| Restates originating transaction | No; paid-at-sale is an immutable settlement classification at saleCompletedAt. |
| Reports action-period activity | No; later collections use receipts_credit_collections. |
| Money-movement effect | Classifies confirmed checkout settlement money; does not replace money_received which uses receivedAt. |
| Sales effect | Settlement mix of recognised sales; not a restatement of sales value. |
| Receivable or customer-obligation effect | Residual after paid-at-sale is credit-originated and may open receivable. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED until saleCompletedAt and settlement allocation exist. |
| Correction and restatement treatment | Immutable after saleCompletedAt once fields exist; later payments are collections. |
| Drill-down grain | Sale, saleCompletedAt, checkout-settlement payments with confirmedAt. |
| Reconciliation relationship | Sum of per-sale paid-at-sale portions equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-SALE-1 saleCompletedAt checkout-finalisation timestamp and payment settlement allocation relation |
| Material-claim classification | Requires accounting decision |

## 5.17 credit_originated_sale_value_incl_tax — Credit-Originated Sale Value incl tax

| Attribute | Definition |
| --- | --- |
| Metric ID | credit_originated_sale_value_incl_tax |
| Canonical name | Credit-Originated Sale Value incl tax |
| Business question | What portion of eligible completed sales was not settled at sale completion? |
| Metric type | FLOW |
| Event or balance population | Eligible completed sales in the sale period with saleCompletedAt known. |
| Inclusion and exclusion rules | Include residual sale value after paid_at_sale_value_incl_tax for the matching sales. Exclude VOID. |
| Status treatment | Computed at saleCompletedAt; later collections do not reduce this originating classification. |
| Exact canonical formula | SUM (eligible completed sale value minus paid_at_sale_value_incl_tax) for the matching sales in period. |
| Authoritative timestamp or asOf rule | saleCompletedAt cut-off; sale createdAt for period membership. |
| Period attribution | Originating sale period. |
| Restates originating transaction | No; credit origination is fixed at saleCompletedAt. |
| Reports action-period activity | No; subsequent collections are receipts_credit_collections. |
| Money-movement effect | Originating credit exposure; later money_received may settle it. |
| Sales effect | Settlement classification of sales, not a restated sales total. |
| Receivable or customer-obligation effect | Typically opens or equals originating receivable for the residual. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED until DEP-SALE-1 fields exist. |
| Correction and restatement treatment | Immutable after saleCompletedAt. |
| Drill-down grain | Sale totals and paid-at-sale portions. |
| Reconciliation relationship | paid_at_sale_value_incl_tax + credit_originated_sale_value_incl_tax equals eligible completed sale value for matching sales. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-SALE-1 saleCompletedAt and settlement allocation |
| Material-claim classification | Requires accounting decision |

## 5.18 fully_settled_sales_value_incl_tax_asof — Fully Settled Sales Value As-Of

| Attribute | Definition |
| --- | --- |
| Metric ID | fully_settled_sales_value_incl_tax_asof |
| Canonical name | Fully Settled Sales Value As-Of |
| Business question | Of sales in the sale period, what value is fully settled as of asOf? |
| Metric type | FLOW |
| Event or balance population | Period sales not VOID whose confirmed allocated collections asOf cover total and that retain no open receivable after valid returns asOf. |
| Inclusion and exclusion rules | Include sales whose confirmed collections cover the restated remaining charge and open receivable is zero asOf. Exclude VOID and partially unsettled sales. |
| Status treatment | Settlement state evaluated at asOf after valid returns. |
| Exact canonical formula | SUM totalPence (or restated remaining charge) of period sales not VOID whose confirmed allocated collections asOf cover total and that retain no open receivable after valid returns asOf. |
| Authoritative timestamp or asOf rule | Sale createdAt for membership; settlement and return state at asOf. |
| Period attribution | Sale-period membership with point-in-time settlement asOf. |
| Restates originating transaction | Yes; settlement completeness reflects returns and collections known by asOf. |
| Reports action-period activity | No; this is asOf settlement state of sale-period members. |
| Money-movement effect | Reflects collections completeness; not a money_received total. |
| Sales effect | Value of sales that are fully settled asOf. |
| Receivable or customer-obligation effect | Requires zero open receivable after valid returns asOf. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL without return-line grain for partial returns. |
| Correction and restatement treatment | May change as later collections or returns become known by a later asOf. |
| Drill-down grain | Sale, collections, open receivable, return allocations. |
| Reconciliation relationship | Sum of qualifying sale values equals headline. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-RET-1 for partial return settlement completeness |
| Material-claim classification | Proposed universal rule |

## 5.19 fully_settled_sales_count_asof — Fully Settled Sales Count As-Of

| Attribute | Definition |
| --- | --- |
| Metric ID | fully_settled_sales_count_asof |
| Canonical name | Fully Settled Sales Count As-Of |
| Business question | How many sale-period sales are fully settled as of asOf? |
| Metric type | COUNT |
| Event or balance population | Sales meeting the fully_settled_sales_value_incl_tax_asof rule. |
| Inclusion and exclusion rules | Count each sale that meets the fully settled value rule once. |
| Status treatment | Settlement state at asOf. |
| Exact canonical formula | COUNT of sales meeting the fully_settled_sales_value_incl_tax_asof rule. |
| Authoritative timestamp or asOf rule | Sale createdAt for membership; settlement asOf. |
| Period attribution | Sale-period membership with point-in-time settlement asOf. |
| Restates originating transaction | Yes; count reflects settlement after returns and collections known by asOf. |
| Reports action-period activity | No; asOf settlement count. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Count companion to fully settled sales value. |
| Receivable or customer-obligation effect | Requires zero open receivable. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL without return-line grain. |
| Correction and restatement treatment | May change with later asOf. |
| Drill-down grain | Qualifying sales. |
| Reconciliation relationship | Count of qualifying sales equals headline. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-RET-1 for partial return settlement completeness |
| Material-claim classification | Proposed universal rule |

## 5.20 money_received — Money Received confirmed

| Attribute | Definition |
| --- | --- |
| Metric ID | money_received |
| Canonical name | Money Received confirmed |
| Business question | How much confirmed customer money was received in the period by receivedAt, regardless of later parent invoice RETURNED or VOID status? |
| Metric type | FLOW |
| Event or balance population | SalesPayment rows with status CONFIRMED and receivedAt in the requested period, across all payment methods in scope. |
| Inclusion and exclusion rules | Include CONFIRMED payments with receivedAt in period. Exclude FAILED, CANCELLED, VOID, PENDING, null, and unknown statuses. MUST NOT exclude a payment because its parent SalesInvoice is RETURNED or VOID. Parent invoice status filters are forbidden for this Metric ID. |
| Status treatment | Include only CONFIRMED. Exclude FAILED, CANCELLED, VOID, PENDING, null, and unknown statuses. MUST NOT filter out payments because the parent invoice is RETURNED or VOID. |
| Exact canonical formula | SUM SalesPayment.amountPence WHERE status = CONFIRMED AND receivedAt IN period. No filter on parent SalesInvoice.status. Exclude FAILED, CANCELLED, VOID, PENDING, null, unknown. |
| Authoritative timestamp or asOf rule | SalesPayment.receivedAt is the sole period cut-off for this Metric ID. |
| Period attribution | Attributed to the payment receivedAt period, independent of sale period and of later parent RETURNED or VOID status. |
| Restates originating transaction | No; confirmed receipts remain in their receivedAt period after later returns, voids, or refunds. |
| Reports action-period activity | Yes; reports action-period confirmed receipts by receivedAt. |
| Money-movement effect | Increases confirmed customer cash in by the payment amount. Refunds and payment reversals are separate Metric IDs and must not silently reduce this total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | May reduce open receivable when allocated to a customer charge; this Metric ID itself remains a money inflow total. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | Formula is defined. Current Trading Weekly and liquid-asset paths still filter parent RETURNED/VOID invoices, which is non-conformant to this Metric ID. |
| Correction and restatement treatment | Historical CONFIRMED receipts stay in money_received*; later refunds use refund_outflows; later reversals use payment_reversal_outflows. |
| Drill-down grain | SalesPayment rows with status, method, receivedAt, amountPence, and parent invoice id for audit without exclusion. |
| Reconciliation relationship | Sum of qualifying CONFIRMED payment amounts equals the headline for period and scope. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-PAY-1 remove parent RETURNED/VOID invoice filters from money_received query paths (weekly-digest.ts; today-kpis liquid assets) |
| Material-claim classification | Confirmed implementation fact |

## 5.21 money_received_cash — Money Received Cash

| Attribute | Definition |
| --- | --- |
| Metric ID | money_received_cash |
| Canonical name | Money Received Cash |
| Business question | How much confirmed CASH customer money was received in the period by receivedAt, regardless of later parent invoice RETURNED or VOID status? |
| Metric type | FLOW |
| Event or balance population | SalesPayment rows with status CONFIRMED, method CASH, and receivedAt in the requested period. |
| Inclusion and exclusion rules | Include CONFIRMED payments with method CASH and receivedAt in period. Exclude non-CASH methods. Exclude FAILED, CANCELLED, VOID, PENDING, null, and unknown statuses. MUST NOT exclude a payment because its parent SalesInvoice is RETURNED or VOID. |
| Status treatment | Include only CONFIRMED. Exclude FAILED, CANCELLED, VOID, PENDING, null, and unknown statuses. MUST NOT filter out payments because the parent invoice is RETURNED or VOID. |
| Exact canonical formula | SUM SalesPayment.amountPence WHERE status = CONFIRMED AND method = CASH AND receivedAt IN period. No filter on parent SalesInvoice.status. Exclude FAILED, CANCELLED, VOID, PENDING, null, unknown. |
| Authoritative timestamp or asOf rule | SalesPayment.receivedAt is the sole period cut-off for this Metric ID. |
| Period attribution | Attributed to the payment receivedAt period, independent of sale period and of later parent RETURNED or VOID status. |
| Restates originating transaction | No; confirmed receipts remain in their receivedAt period after later returns, voids, or refunds. |
| Reports action-period activity | Yes; reports action-period confirmed receipts by receivedAt. |
| Money-movement effect | Increases confirmed customer cash in by the payment amount. Refunds and payment reversals are separate Metric IDs and must not silently reduce this total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | May reduce open receivable when allocated to a customer charge; this Metric ID itself remains a money inflow total. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | Formula is defined. Current Trading Weekly and liquid-asset paths still filter parent RETURNED/VOID invoices, which is non-conformant to this Metric ID. |
| Correction and restatement treatment | Historical CONFIRMED receipts stay in money_received*; later refunds use refund_outflows; later reversals use payment_reversal_outflows. |
| Drill-down grain | SalesPayment rows with status, method, receivedAt, amountPence, and parent invoice id for audit without exclusion. |
| Reconciliation relationship | Sum of qualifying CONFIRMED payment amounts equals the headline for period and scope. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-PAY-1 remove parent RETURNED/VOID invoice filters from money_received query paths (weekly-digest.ts; today-kpis liquid assets) |
| Material-claim classification | Confirmed implementation fact |

## 5.22 money_received_momo — Money Received MoMo

| Attribute | Definition |
| --- | --- |
| Metric ID | money_received_momo |
| Canonical name | Money Received MoMo |
| Business question | How much confirmed MOBILE_MONEY customer money was received in the period by receivedAt, regardless of later parent invoice RETURNED or VOID status? |
| Metric type | FLOW |
| Event or balance population | SalesPayment rows with status CONFIRMED, method MOBILE_MONEY, and receivedAt in the requested period. |
| Inclusion and exclusion rules | Include CONFIRMED payments with method MOBILE_MONEY and receivedAt in period. Exclude non-MOBILE_MONEY methods. Exclude FAILED, CANCELLED, VOID, PENDING, null, and unknown statuses. MUST NOT exclude a payment because its parent SalesInvoice is RETURNED or VOID. |
| Status treatment | Include only CONFIRMED. Exclude FAILED, CANCELLED, VOID, PENDING, null, and unknown statuses. MUST NOT filter out payments because the parent invoice is RETURNED or VOID. |
| Exact canonical formula | SUM SalesPayment.amountPence WHERE status = CONFIRMED AND method = MOBILE_MONEY AND receivedAt IN period. No filter on parent SalesInvoice.status. Exclude FAILED, CANCELLED, VOID, PENDING, null, unknown. |
| Authoritative timestamp or asOf rule | SalesPayment.receivedAt is the sole period cut-off for this Metric ID. |
| Period attribution | Attributed to the payment receivedAt period, independent of sale period and of later parent RETURNED or VOID status. |
| Restates originating transaction | No; confirmed receipts remain in their receivedAt period after later returns, voids, or refunds. |
| Reports action-period activity | Yes; reports action-period confirmed receipts by receivedAt. |
| Money-movement effect | Increases confirmed customer cash in by the payment amount. Refunds and payment reversals are separate Metric IDs and must not silently reduce this total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | May reduce open receivable when allocated to a customer charge; this Metric ID itself remains a money inflow total. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | Formula is defined. Current Trading Weekly and liquid-asset paths still filter parent RETURNED/VOID invoices, which is non-conformant to this Metric ID. |
| Correction and restatement treatment | Historical CONFIRMED receipts stay in money_received*; later refunds use refund_outflows; later reversals use payment_reversal_outflows. |
| Drill-down grain | SalesPayment rows with status, method, receivedAt, amountPence, and parent invoice id for audit without exclusion. |
| Reconciliation relationship | Sum of qualifying CONFIRMED payment amounts equals the headline for period and scope. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-PAY-1 remove parent RETURNED/VOID invoice filters from money_received query paths (weekly-digest.ts; today-kpis liquid assets) |
| Material-claim classification | Confirmed implementation fact |

## 5.23 money_received_card — Money Received Card

| Attribute | Definition |
| --- | --- |
| Metric ID | money_received_card |
| Canonical name | Money Received Card |
| Business question | How much confirmed CARD customer money was received in the period by receivedAt, regardless of later parent invoice RETURNED or VOID status? |
| Metric type | FLOW |
| Event or balance population | SalesPayment rows with status CONFIRMED, method CARD, and receivedAt in the requested period. |
| Inclusion and exclusion rules | Include CONFIRMED payments with method CARD and receivedAt in period. Exclude non-CARD methods. Exclude FAILED, CANCELLED, VOID, PENDING, null, and unknown statuses. MUST NOT exclude a payment because its parent SalesInvoice is RETURNED or VOID. |
| Status treatment | Include only CONFIRMED. Exclude FAILED, CANCELLED, VOID, PENDING, null, and unknown statuses. MUST NOT filter out payments because the parent invoice is RETURNED or VOID. |
| Exact canonical formula | SUM SalesPayment.amountPence WHERE status = CONFIRMED AND method = CARD AND receivedAt IN period. No filter on parent SalesInvoice.status. Exclude FAILED, CANCELLED, VOID, PENDING, null, unknown. |
| Authoritative timestamp or asOf rule | SalesPayment.receivedAt is the sole period cut-off for this Metric ID. |
| Period attribution | Attributed to the payment receivedAt period, independent of sale period and of later parent RETURNED or VOID status. |
| Restates originating transaction | No; confirmed receipts remain in their receivedAt period after later returns, voids, or refunds. |
| Reports action-period activity | Yes; reports action-period confirmed receipts by receivedAt. |
| Money-movement effect | Increases confirmed customer cash in by the payment amount. Refunds and payment reversals are separate Metric IDs and must not silently reduce this total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | May reduce open receivable when allocated to a customer charge; this Metric ID itself remains a money inflow total. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | Formula is defined. Current Trading Weekly and liquid-asset paths still filter parent RETURNED/VOID invoices, which is non-conformant to this Metric ID. |
| Correction and restatement treatment | Historical CONFIRMED receipts stay in money_received*; later refunds use refund_outflows; later reversals use payment_reversal_outflows. |
| Drill-down grain | SalesPayment rows with status, method, receivedAt, amountPence, and parent invoice id for audit without exclusion. |
| Reconciliation relationship | Sum of qualifying CONFIRMED payment amounts equals the headline for period and scope. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-PAY-1 remove parent RETURNED/VOID invoice filters from money_received query paths (weekly-digest.ts; today-kpis liquid assets) |
| Material-claim classification | Confirmed implementation fact |

## 5.24 money_received_transfer — Money Received Transfer

| Attribute | Definition |
| --- | --- |
| Metric ID | money_received_transfer |
| Canonical name | Money Received Transfer |
| Business question | How much confirmed TRANSFER customer money was received in the period by receivedAt, regardless of later parent invoice RETURNED or VOID status? |
| Metric type | FLOW |
| Event or balance population | SalesPayment rows with status CONFIRMED, method TRANSFER, and receivedAt in the requested period. |
| Inclusion and exclusion rules | Include CONFIRMED payments with method TRANSFER and receivedAt in period. Exclude non-TRANSFER methods. Exclude FAILED, CANCELLED, VOID, PENDING, null, and unknown statuses. MUST NOT exclude a payment because its parent SalesInvoice is RETURNED or VOID. |
| Status treatment | Include only CONFIRMED. Exclude FAILED, CANCELLED, VOID, PENDING, null, and unknown statuses. MUST NOT filter out payments because the parent invoice is RETURNED or VOID. |
| Exact canonical formula | SUM SalesPayment.amountPence WHERE status = CONFIRMED AND method = TRANSFER AND receivedAt IN period. No filter on parent SalesInvoice.status. Exclude FAILED, CANCELLED, VOID, PENDING, null, unknown. |
| Authoritative timestamp or asOf rule | SalesPayment.receivedAt is the sole period cut-off for this Metric ID. |
| Period attribution | Attributed to the payment receivedAt period, independent of sale period and of later parent RETURNED or VOID status. |
| Restates originating transaction | No; confirmed receipts remain in their receivedAt period after later returns, voids, or refunds. |
| Reports action-period activity | Yes; reports action-period confirmed receipts by receivedAt. |
| Money-movement effect | Increases confirmed customer cash in by the payment amount. Refunds and payment reversals are separate Metric IDs and must not silently reduce this total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | May reduce open receivable when allocated to a customer charge; this Metric ID itself remains a money inflow total. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | Formula is defined. Current Trading Weekly and liquid-asset paths still filter parent RETURNED/VOID invoices, which is non-conformant to this Metric ID. |
| Correction and restatement treatment | Historical CONFIRMED receipts stay in money_received*; later refunds use refund_outflows; later reversals use payment_reversal_outflows. |
| Drill-down grain | SalesPayment rows with status, method, receivedAt, amountPence, and parent invoice id for audit without exclusion. |
| Reconciliation relationship | Sum of qualifying CONFIRMED payment amounts equals the headline for period and scope. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-PAY-1 remove parent RETURNED/VOID invoice filters from money_received query paths (weekly-digest.ts; today-kpis liquid assets) |
| Material-claim classification | Confirmed implementation fact |

## 5.25 money_received_other — Money Received Other

| Attribute | Definition |
| --- | --- |
| Metric ID | money_received_other |
| Canonical name | Money Received Other |
| Business question | How much confirmed customer money by other methods (not CASH, MOBILE_MONEY, CARD, or TRANSFER) was received in the period by receivedAt, regardless of later parent invoice RETURNED or VOID status? |
| Metric type | FLOW |
| Event or balance population | SalesPayment rows with status CONFIRMED, method not in {CASH, MOBILE_MONEY, CARD, TRANSFER}, and receivedAt in the requested period. |
| Inclusion and exclusion rules | Include CONFIRMED payments whose method is outside CASH, MOBILE_MONEY, CARD, and TRANSFER, with receivedAt in period. Exclude the four named methods. Exclude FAILED, CANCELLED, VOID, PENDING, null, and unknown statuses. MUST NOT exclude a payment because its parent SalesInvoice is RETURNED or VOID. |
| Status treatment | Include only CONFIRMED. Exclude FAILED, CANCELLED, VOID, PENDING, null, and unknown statuses. MUST NOT filter out payments because the parent invoice is RETURNED or VOID. |
| Exact canonical formula | SUM SalesPayment.amountPence WHERE status = CONFIRMED AND method NOT IN (CASH, MOBILE_MONEY, CARD, TRANSFER) AND receivedAt IN period. No filter on parent SalesInvoice.status. Exclude FAILED, CANCELLED, VOID, PENDING, null, unknown. |
| Authoritative timestamp or asOf rule | SalesPayment.receivedAt is the sole period cut-off for this Metric ID. |
| Period attribution | Attributed to the payment receivedAt period, independent of sale period and of later parent RETURNED or VOID status. |
| Restates originating transaction | No; confirmed receipts remain in their receivedAt period after later returns, voids, or refunds. |
| Reports action-period activity | Yes; reports action-period confirmed receipts by receivedAt. |
| Money-movement effect | Increases confirmed customer cash in by the payment amount. Refunds and payment reversals are separate Metric IDs and must not silently reduce this total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | May reduce open receivable when allocated to a customer charge; this Metric ID itself remains a money inflow total. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | Formula is defined. Current Trading Weekly and liquid-asset paths still filter parent RETURNED/VOID invoices, which is non-conformant to this Metric ID. |
| Correction and restatement treatment | Historical CONFIRMED receipts stay in money_received*; later refunds use refund_outflows; later reversals use payment_reversal_outflows. |
| Drill-down grain | SalesPayment rows with status, method, receivedAt, amountPence, and parent invoice id for audit without exclusion. |
| Reconciliation relationship | Sum of qualifying CONFIRMED payment amounts equals the headline for period and scope. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-PAY-1 remove parent RETURNED/VOID invoice filters from money_received query paths (weekly-digest.ts; today-kpis liquid assets) |
| Material-claim classification | Strong repository inference |

## 5.26 receipts_credit_collections — Customer Credit Collections

| Attribute | Definition |
| --- | --- |
| Metric ID | receipts_credit_collections |
| Canonical name | Customer Credit Collections |
| Business question | How much confirmed money was collected after saleCompletedAt against credit-originated sales in the period? |
| Metric type | FLOW |
| Event or balance population | CONFIRMED payments allocated to a sale with paymentConfirmedAt greater than saleCompletedAt and receivedAt in period. |
| Inclusion and exclusion rules | Include CONFIRMED post-completion collections. Exclude paid-at-sale payments (paymentConfirmedAt <= saleCompletedAt). Exclude FAILED, CANCELLED, VOID, PENDING, null, unknown. Do not use end-of-day cut-off. |
| Status treatment | CONFIRMED only; requires saleCompletedAt and settlement allocation. |
| Exact canonical formula | SUM CONFIRMED payment amounts allocated to a sale where paymentConfirmedAt > saleCompletedAt AND receivedAt IN period. |
| Authoritative timestamp or asOf rule | receivedAt for period membership; saleCompletedAt defines the post-sale collection cut-off. |
| Period attribution | Payment receivedAt period. |
| Restates originating transaction | No; collections are action-period money activity. |
| Reports action-period activity | Yes; reports post-sale collection activity by receivedAt. |
| Money-movement effect | Confirmed customer cash in after sale completion. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | Reduces open receivable when applied to customer charges. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED until saleCompletedAt and allocation exist. |
| Correction and restatement treatment | Historical collections remain in receivedAt period. |
| Drill-down grain | Payment, saleCompletedAt, allocation link. |
| Reconciliation relationship | Sum of qualifying post-sale payments equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-SALE-1 saleCompletedAt and payment settlement allocation |
| Material-claim classification | Requires accounting decision |

## 5.27 unverified_legacy_receipts — Unverified Legacy Receipts

| Attribute | Definition |
| --- | --- |
| Metric ID | unverified_legacy_receipts |
| Canonical name | Unverified Legacy Receipts |
| Business question | What payment amounts have null or unknown status in the period and must not enter money_received? |
| Metric type | FLOW |
| Event or balance population | SalesPayment rows with null or unknown status and receivedAt in period. |
| Inclusion and exclusion rules | Include null/unknown status amounts. Must never enter money_received or method splits. Exclude CONFIRMED, FAILED, CANCELLED, VOID, PENDING once classified. |
| Status treatment | UNVERIFIED; never promote into money_received without status backfill. |
| Exact canonical formula | SUM amountPence for payments with null or unknown status and receivedAt in period. |
| Authoritative timestamp or asOf rule | receivedAt. |
| Period attribution | Payment receivedAt period. |
| Restates originating transaction | No; control total for unverified receipts. |
| Reports action-period activity | Yes; reports unverified receipt activity by receivedAt. |
| Money-movement effect | Not confirmed money; excluded from money_received. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNVERIFIED quality state; COMPLETE as a control metric when status null/unknown can be detected. |
| Correction and restatement treatment | Backfill status then reclassify; do not silently move into money_received. |
| Drill-down grain | Payments with null/unknown status. |
| Reconciliation relationship | Sum of unverified rows equals headline; disjoint from money_received. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.28 pending_payments_value — Pending Payments Value

| Attribute | Definition |
| --- | --- |
| Metric ID | pending_payments_value |
| Canonical name | Pending Payments Value |
| Business question | What payment or collection amounts are PENDING in the period or at asOf? |
| Metric type | FLOW |
| Event or balance population | Payment or collection rows with status PENDING. |
| Inclusion and exclusion rules | Include PENDING amounts. Exclude from money_received until CONFIRMED. |
| Status treatment | PENDING only; confirmed MoMo PENDING usage in repository. |
| Exact canonical formula | SUM PENDING payment or collection amounts with pending time in period (or open PENDING at asOf for balance views). |
| Authoritative timestamp or asOf rule | Pending creation/update time for period flows; asOf for open pending balance views. |
| Period attribution | Pending activity period or point-in-time open pending. |
| Restates originating transaction | No; pending is not confirmed money. |
| Reports action-period activity | Yes; reports pending payment activity or open pending state. |
| Money-movement effect | Not confirmed money_received. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE for MoMo PENDING collections where status is authoritative. |
| Correction and restatement treatment | Transitions to CONFIRMED or FAILED/CANCELLED update companion metrics. |
| Drill-down grain | PENDING payment rows. |
| Reconciliation relationship | Sum of PENDING amounts equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.29 failed_payments_count — Failed Payments Count

| Attribute | Definition |
| --- | --- |
| Metric ID | failed_payments_count |
| Canonical name | Failed Payments Count |
| Business question | How many FAILED or CANCELLED payments occurred in the period? |
| Metric type | COUNT |
| Event or balance population | Payment rows with status FAILED or CANCELLED and payment time in period. |
| Inclusion and exclusion rules | Include FAILED and CANCELLED. Exclude CONFIRMED and PENDING from this count. |
| Status treatment | FAILED and CANCELLED only. |
| Exact canonical formula | COUNT payments with status FAILED or CANCELLED and payment time in period. |
| Authoritative timestamp or asOf rule | Payment failure/cancellation time. |
| Period attribution | Action period of the failed/cancelled payment. |
| Restates originating transaction | No; failure counts are action-period events. |
| Reports action-period activity | Yes; reports failed/cancelled payment activity. |
| Money-movement effect | Never enters money_received. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when failure statuses are recorded. |
| Correction and restatement treatment | Remains in failure period. |
| Drill-down grain | FAILED/CANCELLED payment rows. |
| Reconciliation relationship | Count of qualifying rows equals headline. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.30 refund_outflows — Refund Outflows

| Attribute | Definition |
| --- | --- |
| Metric ID | refund_outflows |
| Canonical name | Refund Outflows |
| Business question | What intentional customer refund amounts were paid out in the action period? |
| Metric type | FLOW |
| Event or balance population | Intentional customer refund rows with refundEffectiveAt in period. |
| Inclusion and exclusion rules | Include intentional customer refunds. Exclude failed refund attempts. Exclude payment reversals (those belong to payment_reversal_outflows). |
| Status treatment | Authorised completed refunds only. |
| Exact canonical formula | SUM intentional customer refund amounts where refundEffectiveAt is in period. |
| Authoritative timestamp or asOf rule | refundEffectiveAt. |
| Period attribution | Action period of the refund. |
| Restates originating transaction | No; refunds are action-period money outflows; historical money_received stays. |
| Reports action-period activity | Yes; reports refund outflow activity. |
| Money-movement effect | Customer cash out via intentional refund; separate from payment_reversal_outflows. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | May interact with receivable or customer_credit_payable depending on refund versus credit path. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL for whole-sale via SalesReturn.refundAmountPence. |
| Correction and restatement treatment | Refund activity remains in refundEffectiveAt period; money_received history kept. |
| Drill-down grain | Refund rows linked to sale/return. |
| Reconciliation relationship | Sum of refund amounts equals headline; disjoint from payment_reversal_outflows. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.31 payment_reversal_outflows — Payment Reversal Outflows

| Attribute | Definition |
| --- | --- |
| Metric ID | payment_reversal_outflows |
| Canonical name | Payment Reversal Outflows |
| Business question | What payment reversal amounts occurred in the action period? |
| Metric type | FLOW |
| Event or balance population | Dated payment reversal rows with reversalEffectiveAt in period. |
| Inclusion and exclusion rules | Include explicit reversal amounts linked to an original payment. Exclude ordinary intentional customer refunds (refund_outflows). Do not fabricate from hard deletes or status flips. |
| Status treatment | Requires a dated reversal ledger row; status collapse or hard delete is not a reversal. |
| Exact canonical formula | SUM reversal amounts where reversalEffectiveAt is in period. |
| Authoritative timestamp or asOf rule | reversalEffectiveAt. |
| Period attribution | Action period of the reversal. |
| Restates originating transaction | No; reversals are action-period outflows; original money_received history kept. |
| Reports action-period activity | Yes; reports payment reversal activity. |
| Money-movement effect | Corrective money out distinct from refund_outflows. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | May restore receivable depending on reversal economics. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED; no numeric substitute from deletes. |
| Correction and restatement treatment | Original period money_received unchanged; reversal posts in reversal period. |
| Drill-down grain | Reversal row linked to original payment. |
| Reconciliation relationship | Sum of reversal amounts equals headline; disjoint from refund_outflows. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-PAY-3 dated payment reversal ledger; stop hard-delete of payments |
| Material-claim classification | Requires accounting decision |

## 5.32 net_customer_cash_movement — Net Customer Cash Movement

| Attribute | Definition |
| --- | --- |
| Metric ID | net_customer_cash_movement |
| Canonical name | Net Customer Cash Movement |
| Business question | What is money_received minus refund_outflows minus payment_reversal_outflows for the period? |
| Metric type | FLOW |
| Event or balance population | Derived from money_received, refund_outflows, and payment_reversal_outflows for the period. |
| Inclusion and exclusion rules | Defined only when all three component Metric IDs are available for the scope. If any component is UNAVAILABLE, this Metric ID is UNAVAILABLE. |
| Status treatment | Inherits component availability. |
| Exact canonical formula | money_received - refund_outflows - payment_reversal_outflows. |
| Authoritative timestamp or asOf rule | Derived from component period timestamps. |
| Period attribution | Matching period as components. |
| Restates originating transaction | No; analytical net of action-period money components. |
| Reports action-period activity | Yes; net of action-period customer cash components. |
| Money-movement effect | Net customer cash movement for the period. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE if any component is UNAVAILABLE; otherwise inherits weakest component quality. |
| Correction and restatement treatment | Recomputes when components change. |
| Drill-down grain | Component Metric ID rows. |
| Reconciliation relationship | Must equal component arithmetic for the shared scope. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-PAY-3 via payment_reversal_outflows; also affected by DEP-PAY-1 non-conformance on money_received |
| Material-claim classification | Proposed universal rule |

## 5.33 cash_opening_float — Opening Float

| Attribute | Definition |
| --- | --- |
| Metric ID | cash_opening_float |
| Canonical name | Opening Float |
| Business question | What opening float was recorded for shifts in scope? |
| Metric type | FLOW |
| Event or balance population | Shift opening float amounts (OPEN_FLOAT or openingCashPence) with openedAt in period or for the shift set. |
| Inclusion and exclusion rules | Include opening float. Exclude mid-shift adjustments. |
| Status treatment | Uses shift open records. |
| Exact canonical formula | SUM OPEN_FLOAT or openingCashPence for shifts in scope. |
| Authoritative timestamp or asOf rule | openedAt. |
| Period attribution | Shift open period. |
| Restates originating transaction | No; opening float is recorded shift activity. |
| Reports action-period activity | Yes; reports shift opening float activity. |
| Money-movement effect | Drawer cash movement or balance related to till cash control. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when cash-drawer opening fields exist. |
| Correction and restatement treatment | Corrections require authorised drawer adjustment events. |
| Drill-down grain | Shift opening float rows. |
| Reconciliation relationship | Sum of opening floats equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.34 cash_receipts_in_drawer — Cash Receipts in Drawer

| Attribute | Definition |
| --- | --- |
| Metric ID | cash_receipts_in_drawer |
| Canonical name | Cash Receipts in Drawer |
| Business question | What cash sale and cash debtor payment amounts entered the drawer in the period? |
| Metric type | FLOW |
| Event or balance population | Drawer entries of types CASH_SALE and CASH_DEBTOR_PAYMENT with entry time in period. |
| Inclusion and exclusion rules | Include CASH_SALE and CASH_DEBTOR_PAYMENT. Exclude non-cash methods and paid-outs. |
| Status treatment | Posted drawer entry types only. |
| Exact canonical formula | SUM amounts for CASH_SALE plus CASH_DEBTOR_PAYMENT with entry time in period. |
| Authoritative timestamp or asOf rule | Drawer entry time. |
| Period attribution | Entry activity period. |
| Restates originating transaction | No; drawer receipts are action-period entries. |
| Reports action-period activity | Yes; reports drawer cash receipt activity. |
| Money-movement effect | Drawer cash movement or balance related to till cash control. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE for typed drawer entries. |
| Correction and restatement treatment | Remains in entry period; reversals use authorised opposite entries. |
| Drill-down grain | Drawer entry rows by type. |
| Reconciliation relationship | Sum of qualifying entry amounts equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.35 cash_added — Cash Added

| Attribute | Definition |
| --- | --- |
| Metric ID | cash_added |
| Canonical name | Cash Added |
| Business question | What positive cash adjustments were added to the drawer in the period? |
| Metric type | FLOW |
| Event or balance population | Positive CASH_ADJUSTMENT drawer entries with entry time in period. |
| Inclusion and exclusion rules | Include positive CASH_ADJUSTMENT only. |
| Status treatment | Posted positive adjustments. |
| Exact canonical formula | SUM positive CASH_ADJUSTMENT amounts with entry time in period. |
| Authoritative timestamp or asOf rule | Drawer entry time. |
| Period attribution | Entry activity period. |
| Restates originating transaction | No; cash added is action-period activity. |
| Reports action-period activity | Yes; reports cash-added activity. |
| Money-movement effect | Drawer cash movement or balance related to till cash control. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE for typed adjustments. |
| Correction and restatement treatment | Remains in entry period. |
| Drill-down grain | Positive CASH_ADJUSTMENT rows. |
| Reconciliation relationship | Sum equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.36 cash_removed — Cash Removed

| Attribute | Definition |
| --- | --- |
| Metric ID | cash_removed |
| Canonical name | Cash Removed |
| Business question | What classified cash was removed from the drawer in the period? |
| Metric type | FLOW |
| Event or balance population | PAID_OUT_SUPPLIER, PAID_OUT_EXPENSE, and classified negative adjustments with entry time in period. |
| Inclusion and exclusion rules | Include classified paid-outs and classified negative adjustments. Exclude refunds (cash_refunds_from_drawer). |
| Status treatment | Posted classified removal types. |
| Exact canonical formula | SUM PAID_OUT_SUPPLIER plus PAID_OUT_EXPENSE plus classified negative adjustments with entry time in period. |
| Authoritative timestamp or asOf rule | Drawer entry time. |
| Period attribution | Entry activity period. |
| Restates originating transaction | No; cash removed is action-period activity. |
| Reports action-period activity | Yes; reports cash-removed activity. |
| Money-movement effect | Drawer cash movement or balance related to till cash control. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE for typed paid-outs. |
| Correction and restatement treatment | Remains in entry period. |
| Drill-down grain | Paid-out and negative adjustment rows. |
| Reconciliation relationship | Sum equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.37 cash_refunds_from_drawer — Drawer Cash Refunds

| Attribute | Definition |
| --- | --- |
| Metric ID | cash_refunds_from_drawer |
| Canonical name | Drawer Cash Refunds |
| Business question | What absolute cash refund amounts left the drawer in the period? |
| Metric type | FLOW |
| Event or balance population | CASH_REFUND drawer entries with entry time in period. |
| Inclusion and exclusion rules | Include absolute CASH_REFUND amounts. May be skipped operationally if no open shift, but the Metric ID still defines the amount when posted. |
| Status treatment | Posted CASH_REFUND entries. |
| Exact canonical formula | SUM absolute CASH_REFUND amounts with entry time in period. |
| Authoritative timestamp or asOf rule | Drawer entry time. |
| Period attribution | Entry activity period. |
| Restates originating transaction | No; drawer refunds are action-period activity. |
| Reports action-period activity | Yes; reports drawer cash refund activity. |
| Money-movement effect | Drawer cash out for customer refunds; aligns with refund_outflows when cash method. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when CASH_REFUND entries are posted. |
| Correction and restatement treatment | Remains in entry period. |
| Drill-down grain | CASH_REFUND rows. |
| Reconciliation relationship | Sum of absolute refund entries equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.38 cash_expected — Expected Cash

| Attribute | Definition |
| --- | --- |
| Metric ID | cash_expected |
| Canonical name | Expected Cash |
| Business question | What expected cash does the shift compute? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Shift expectedCashPence for shifts in scope. |
| Inclusion and exclusion rules | Include computed expected cash for the shift set. |
| Status treatment | Shift calculation field. |
| Exact canonical formula | SUM or per-shift expectedCashPence for shifts in scope. |
| Authoritative timestamp or asOf rule | Shift open/close context; expected as computed for the shift. |
| Period attribution | Shift scope. |
| Restates originating transaction | No; expected cash is shift control state. |
| Reports action-period activity | No; control balance for the shift. |
| Money-movement effect | Drawer cash movement or balance related to till cash control. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when expectedCashPence is computed by cash-drawer logic. |
| Correction and restatement treatment | Recomputes from drawer entries. |
| Drill-down grain | Shift expectedCashPence. |
| Reconciliation relationship | Equals drawer float plus receipts minus removals/refunds per shift rules. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.39 cash_declared — Declared Cash

| Attribute | Definition |
| --- | --- |
| Metric ID | cash_declared |
| Canonical name | Declared Cash |
| Business question | What actual cash was declared on closed shifts? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Closed shifts with actualCashPence. |
| Inclusion and exclusion rules | Include actualCashPence on closed shifts. Exclude open shifts. |
| Status treatment | Closed shifts only. |
| Exact canonical formula | SUM actualCashPence on closed shifts in scope. |
| Authoritative timestamp or asOf rule | closedAt. |
| Period attribution | Shift close period. |
| Restates originating transaction | No; declared cash is recorded at close. |
| Reports action-period activity | Yes; reports declared cash at shift close. |
| Money-movement effect | Drawer cash movement or balance related to till cash control. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE for closed shifts with actualCashPence. |
| Correction and restatement treatment | Corrections require authorised recount events. |
| Drill-down grain | Closed shift actualCashPence. |
| Reconciliation relationship | Sum of declared amounts equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.40 cash_difference — Cash Difference

| Attribute | Definition |
| --- | --- |
| Metric ID | cash_difference |
| Canonical name | Cash Difference |
| Business question | What is actualCashPence minus expectedCashPence on closed shifts? |
| Metric type | FLOW |
| Event or balance population | Closed shifts in scope. |
| Inclusion and exclusion rules | Include signed difference per closed shift. |
| Status treatment | Closed shifts only. |
| Exact canonical formula | SUM (actualCashPence - expectedCashPence) for closed shifts in scope. |
| Authoritative timestamp or asOf rule | closedAt. |
| Period attribution | Shift close period. |
| Restates originating transaction | No; difference is recorded at close. |
| Reports action-period activity | Yes; reports close-time cash difference. |
| Money-movement effect | Drawer cash movement or balance related to till cash control. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE for closed shifts. |
| Correction and restatement treatment | Fixed at close unless authorised recount. |
| Drill-down grain | Per-shift actual and expected. |
| Reconciliation relationship | Sum of per-shift differences equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.41 cash_difference_abs — Absolute Cash Difference

| Attribute | Definition |
| --- | --- |
| Metric ID | cash_difference_abs |
| Canonical name | Absolute Cash Difference |
| Business question | What is the sum of absolute cash differences for closed shifts in range? |
| Metric type | FLOW |
| Event or balance population | Closed shifts in range. |
| Inclusion and exclusion rules | Include absolute value of each shift cash_difference. |
| Status treatment | Closed shifts only. |
| Exact canonical formula | SUM abs(actualCashPence - expectedCashPence) for closed shifts in range. |
| Authoritative timestamp or asOf rule | closedAt. |
| Period attribution | Shift close range. |
| Restates originating transaction | No; control total of absolute differences. |
| Reports action-period activity | Yes; reports absolute close differences in range. |
| Money-movement effect | Drawer cash movement or balance related to till cash control. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE for closed shifts; control total, not a P&L net. |
| Correction and restatement treatment | Recomputes from closed shift differences. |
| Drill-down grain | Per-shift absolute differences. |
| Reconciliation relationship | Sum of absolute per-shift differences equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.42 open_shifts — Open Shifts

| Attribute | Definition |
| --- | --- |
| Metric ID | open_shifts |
| Canonical name | Open Shifts |
| Business question | How many shifts are OPEN at asOf? |
| Metric type | COUNT |
| Event or balance population | Shifts with status OPEN at asOf. |
| Inclusion and exclusion rules | Include OPEN. Exclude CLOSED. |
| Status treatment | OPEN only. |
| Exact canonical formula | COUNT shifts with status OPEN at asOf. |
| Authoritative timestamp or asOf rule | asOf / now. |
| Period attribution | Point-in-time. |
| Restates originating transaction | No; live open-shift count. |
| Reports action-period activity | No; point-in-time count. |
| Money-movement effect | Drawer cash movement or balance related to till cash control. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | DISTINCT_COUNT |
| Data-quality requirement | COMPLETE. |
| Correction and restatement treatment | Live asOf. |
| Drill-down grain | OPEN shift rows. |
| Reconciliation relationship | Count of OPEN shifts equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.43 overdue_shifts — Overdue Shifts

| Attribute | Definition |
| --- | --- |
| Metric ID | overdue_shifts |
| Canonical name | Overdue Shifts |
| Business question | How many OPEN shifts are older than the policy threshold hours at asOf? |
| Metric type | COUNT |
| Event or balance population | OPEN shifts whose age exceeds the configured policy threshold hours at asOf. |
| Inclusion and exclusion rules | Include OPEN shifts older than threshold. Exclude CLOSED. Threshold hours require an explicit product policy. |
| Status treatment | OPEN and overdue by policy threshold. |
| Exact canonical formula | COUNT OPEN shifts with age > policy_threshold_hours at asOf. |
| Authoritative timestamp or asOf rule | asOf / now. |
| Period attribution | Point-in-time. |
| Restates originating transaction | No; live control count. |
| Reports action-period activity | No; point-in-time count. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | DISTINCT_COUNT |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL until policy threshold is product-decided and configured. |
| Correction and restatement treatment | Live asOf. |
| Drill-down grain | OPEN shifts with openedAt and age. |
| Reconciliation relationship | Count of overdue OPEN shifts equals headline. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Requires product decision |

## 5.44 cogs_restated — COGS Restated

| Attribute | Definition |
| --- | --- |
| Metric ID | cogs_restated |
| Canonical name | COGS Restated |
| Business question | What reliable sale-time COGS remains recognised for the sale period after return allocations as of asOf? |
| Metric type | FLOW |
| Event or balance population | Restated sale lines in period with reliable immutable sale-time unit cost on retained qty after return allocations asOf. |
| Inclusion and exclusion rules | Include reliable_cost * retained_qty only. Missing cost must not enter as zero. Inferred defaultCost must not enter canonical COGS. EXPLICIT_ZERO provenance is required to treat zero as a real cost. |
| Status treatment | Only reliable-costed retained quantities; missing-cost lines excluded from the sum and tracked via cost_coverage_pct. |
| Exact canonical formula | SUM (immutable sale-time unit cost * retained qty after return allocations) for restated sale lines with reliable cost provenance only. |
| Authoritative timestamp or asOf rule | Sale createdAt membership; return allocations and cost provenance at asOf. |
| Period attribution | Originating sale period restated as of asOf. |
| Restates originating transaction | Yes; restates COGS for retained quantities after returns known by asOf. |
| Reports action-period activity | No; action-period damaged write-off uses damaged_stock_writeoff_loss. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | Canonical restated COGS from reliable costs only. |
| Gross Profit or expense effect | Subtracted in gross_profit_complete only when cost_coverage_pct is 100. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | INCOMPLETE if cost_coverage_pct is below 100 percent; NEVER treat missing cost as zero. |
| Correction and restatement treatment | Restates with returns; cost provenance corrections require authorised cost correction references. |
| Drill-down grain | Sale line retained qty, unit cost, provenance flag. |
| Reconciliation relationship | Sum of reliable-costed line COGS equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-RET-1 line-return allocation; reliable cost provenance (missing ≠ zero; no inferred defaultCost) |
| Material-claim classification | Proposed universal rule |

## 5.45 cost_coverage_pct — Cost Coverage pct

| Attribute | Definition |
| --- | --- |
| Metric ID | cost_coverage_pct |
| Canonical name | Cost Coverage pct |
| Business question | What percent of restated eligible lineSubtotal remaining is covered by reliable cost provenance? |
| Metric type | RATIO |
| Event or balance population | Restated sale lines in period after return allocations asOf. |
| Inclusion and exclusion rules | Numerator: reliable_costed_lineSubtotal_remaining. Denominator: eligible_lineSubtotal_remaining. Missing cost is not zero coverage credit. |
| Status treatment | Coverage ratio; COMPLETE as a ratio even when below 100. |
| Exact canonical formula | 100 * reliable_costed_lineSubtotal_remaining / eligible_lineSubtotal_remaining on the restated population. |
| Authoritative timestamp or asOf rule | Derived at asOf for the sale period population. |
| Period attribution | Originating sale period restated as of asOf. |
| Restates originating transaction | Yes; coverage reflects restated retained lines asOf. |
| Reports action-period activity | No; coverage is not action-period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | Gate for whether cogs_restated can support complete GP. |
| Gross Profit or expense effect | gross_profit_complete requires this equals 100. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | RATIO |
| Data-quality requirement | COMPLETE as a ratio; EXPLICIT_ZERO provenance required to count zero-cost lines as costed. |
| Correction and restatement treatment | Recomputes when costs or returns change. |
| Drill-down grain | Costed versus missing-cost partitions of retained lines. |
| Reconciliation relationship | Must equal partition arithmetic. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-RET-1; cost provenance stamps for zero versus missing |
| Material-claim classification | Proposed universal rule |

## 5.46 gross_profit_complete — Gross Profit Complete

| Attribute | Definition |
| --- | --- |
| Metric ID | gross_profit_complete |
| Canonical name | Gross Profit Complete |
| Business question | What complete Gross Profit equals revenue_excl_tax_restated minus cogs_restated when cost coverage is 100 percent? |
| Metric type | FLOW |
| Event or balance population | Defined only when cost_coverage_pct equals 100 for the restated sale-period population asOf. |
| Inclusion and exclusion rules | Include only when every retained eligible line has reliable cost provenance (coverage 100). If coverage < 100, do not emit a complete GP number. Missing cost ≠ zero. |
| Status treatment | COMPLETE only at 100% coverage; otherwise UNAVAILABLE (not a partial fake GP). |
| Exact canonical formula | IF cost_coverage_pct = 100 THEN revenue_excl_tax_restated - cogs_restated ELSE UNAVAILABLE. |
| Authoritative timestamp or asOf rule | Derived from restated components at asOf. |
| Period attribution | Originating sale period restated as of asOf. |
| Restates originating transaction | Yes; complete GP restates with revenue and COGS after returns. |
| Reports action-period activity | No; not action-period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Uses revenue_excl_tax_restated. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | Uses cogs_restated only at 100% coverage. |
| Gross Profit or expense effect | Canonical complete Gross Profit label. |
| Tax basis | Tax-exclusive revenue components only; do not invent tax splits from inclusive totals. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE or UNAVAILABLE; never silently complete with missing costs treated as zero. |
| Correction and restatement treatment | Recomputes when components restate; coverage gate always applied. |
| Drill-down grain | Revenue and COGS component lines with coverage proof. |
| Reconciliation relationship | Equals component subtraction when COMPLETE. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-RET-1 and reliable cost provenance at 100% coverage |
| Material-claim classification | Proposed universal rule |

## 5.47 gross_profit_on_costed_sales — Profit on Costed Sales

| Attribute | Definition |
| --- | --- |
| Metric ID | gross_profit_on_costed_sales |
| Canonical name | Profit on Costed Sales |
| Business question | What profit equals lineSubtotal minus reliable cost on costed retained lines only? |
| Metric type | FLOW |
| Event or balance population | Retained lines with reliable cost provenance after return allocations asOf. |
| Inclusion and exclusion rules | Include only costed retained lines. Exclude missing-cost lines. This Metric ID is always INCOMPLETE as a complete Gross Profit label. |
| Status treatment | INCOMPLETE as Gross Profit Complete; computable on the costed subset. |
| Exact canonical formula | SUM (lineSubtotal - reliable cost) on costed retained lines only. |
| Authoritative timestamp or asOf rule | Sale period membership; asOf allocations. |
| Period attribution | Originating sale period restated as of asOf. |
| Restates originating transaction | Yes; restates on costed retained lines after returns. |
| Reports action-period activity | No; not action-period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Uses costed retained lineSubtotals only. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | Uses reliable costs on the costed subset only. |
| Gross Profit or expense effect | Analytical on-costed profit; MUST NOT be labelled gross_profit_complete. |
| Tax basis | Tax-exclusive revenue components only; do not invent tax splits from inclusive totals. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | Always INCOMPLETE as a complete GP label; disclose coverage. |
| Correction and restatement treatment | Recomputes with returns and cost provenance changes. |
| Drill-down grain | Costed retained lines with subtotal and cost. |
| Reconciliation relationship | Sum of on-costed line profits equals headline. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-RET-1; reliable cost provenance |
| Material-claim classification | Proposed universal rule |

## 5.48 gross_margin_pct_complete — Gross Margin pct Complete

| Attribute | Definition |
| --- | --- |
| Metric ID | gross_margin_pct_complete |
| Canonical name | Gross Margin pct Complete |
| Business question | What complete gross margin percent equals gross_profit_complete / revenue_excl_tax_restated? |
| Metric type | RATIO |
| Event or balance population | Derived when gross_profit_complete is COMPLETE. |
| Inclusion and exclusion rules | Defined only when gross_profit_complete is available and revenue_excl_tax_restated ≠ 0. |
| Status treatment | UNAVAILABLE if GP complete is unavailable. |
| Exact canonical formula | gross_profit_complete / revenue_excl_tax_restated. |
| Authoritative timestamp or asOf rule | Derived from components at asOf. |
| Period attribution | Matching restated sale period. |
| Restates originating transaction | Yes; derived from restated complete GP components. |
| Reports action-period activity | No; derived ratio. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Denominator is restated ex-tax revenue. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | Margin form of gross_profit_complete. |
| Tax basis | Tax-exclusive revenue components only; do not invent tax splits from inclusive totals. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | RATIO |
| Data-quality requirement | UNAVAILABLE if gross_profit_complete is UNAVAILABLE. |
| Correction and restatement treatment | Recomputes with components. |
| Drill-down grain | Component GP and revenue. |
| Reconciliation relationship | Must equal component division. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-RET-1 and 100% cost coverage via gross_profit_complete |
| Material-claim classification | Proposed universal rule |

## 5.49 product_margin_on_costed_sales — Product Margin on Costed Sales

| Attribute | Definition |
| --- | --- |
| Metric ID | product_margin_on_costed_sales |
| Canonical name | Product Margin on Costed Sales |
| Business question | What on-costed profit grouped by product remains on costed retained lines? |
| Metric type | FLOW |
| Event or balance population | Costed retained lines grouped by product after return allocations asOf. |
| Inclusion and exclusion rules | Include costed retained lines only. Exclude missing-cost lines. INCOMPLETE as GP label. |
| Status treatment | INCOMPLETE as complete GP; grouped analytical margin. |
| Exact canonical formula | SUM (lineSubtotal - reliable cost) on costed retained lines GROUP BY product. |
| Authoritative timestamp or asOf rule | Sale period membership; asOf allocations. |
| Period attribution | Originating sale period restated as of asOf. |
| Restates originating transaction | Yes; restates on-costed product margins after returns. |
| Reports action-period activity | No; not action-period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Product-grouped costed retained subtotals. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | Product-grouped reliable costs. |
| Gross Profit or expense effect | Analytical product margin on costed sales only; not gross_profit_complete. |
| Tax basis | Tax-exclusive revenue components only; do not invent tax splits from inclusive totals. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | INCOMPLETE as GP label; disclose coverage. |
| Correction and restatement treatment | Recomputes with returns and costs. |
| Drill-down grain | Product, costed lines. |
| Reconciliation relationship | Sum across products equals gross_profit_on_costed_sales for the shared scope. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-RET-1; reliable cost provenance |
| Material-claim classification | Proposed universal rule |

## 5.50 category_margin_on_costed_sales — Category Margin on Costed Sales

| Attribute | Definition |
| --- | --- |
| Metric ID | category_margin_on_costed_sales |
| Canonical name | Category Margin on Costed Sales |
| Business question | What on-costed profit grouped by category remains on costed retained lines? |
| Metric type | FLOW |
| Event or balance population | Costed retained lines grouped by category after return allocations asOf. |
| Inclusion and exclusion rules | Include costed retained lines only. Exclude missing-cost lines. INCOMPLETE as GP label. |
| Status treatment | INCOMPLETE as complete GP; grouped analytical margin. |
| Exact canonical formula | SUM (lineSubtotal - reliable cost) on costed retained lines GROUP BY category. |
| Authoritative timestamp or asOf rule | Sale period membership; asOf allocations. |
| Period attribution | Originating sale period restated as of asOf. |
| Restates originating transaction | Yes; restates on-costed category margins after returns. |
| Reports action-period activity | No; not action-period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Category-grouped costed retained subtotals. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | Category-grouped reliable costs. |
| Gross Profit or expense effect | Analytical category margin on costed sales only; not gross_profit_complete. |
| Tax basis | Tax-exclusive revenue components only; do not invent tax splits from inclusive totals. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | INCOMPLETE as GP label; disclose coverage. |
| Correction and restatement treatment | Recomputes with returns and costs. |
| Drill-down grain | Category, costed lines. |
| Reconciliation relationship | Sum across categories equals gross_profit_on_costed_sales for the shared scope. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-RET-1; reliable cost provenance |
| Material-claim classification | Proposed universal rule |

## 5.51 ar_balance — Receivables Balance

| Attribute | Definition |
| --- | --- |
| Metric ID | ar_balance |
| Canonical name | Receivables Balance |
| Business question | What is the full open customer receivable balance at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open customer balances at asOf after valid charges, collections, returns, credit notes, and authorised adjustments; full open set with no silent 90-day createdAt floor. |
| Inclusion and exclusion rules | Include all open customer receivable balances in scope. Exclude using a 90-day createdAt floor (that is ar_monitoring_90d). Exclude settled-zero balances. |
| Status treatment | Open balances only at asOf. |
| Exact canonical formula | SUM open customer balances at asOf after valid charges, collections, returns, credit notes, and authorised adjustments. |
| Authoritative timestamp or asOf rule | asOf. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time open balance (may reflect prior restatements of charges). |
| Reports action-period activity | No; balance, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | Headline open receivable. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL where Command Center applies a 90-day floor; that path must not use this Metric ID. |
| Correction and restatement treatment | Live asOf; changes with charges, collections, returns, notes, adjustments. |
| Drill-down grain | Open customer invoice/balance rows. |
| Reconciliation relationship | ar_balance = ar_current + ar_due_today + ar_overdue + ar_due_date_unknown for the shared asOf and scope. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.52 ar_current — Current Receivables

| Attribute | Definition |
| --- | --- |
| Metric ID | ar_current |
| Canonical name | Current Receivables |
| Business question | What portion of ar_balance has due status CURRENT at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open customer balances at asOf whose contractual dueDate exists and dueDate is after the asOf local date. |
| Inclusion and exclusion rules | Include only CURRENT due status. Exclude DUE_TODAY, OVERDUE, and DUE_DATE_UNKNOWN. Due status at asOf uses contractual dueDate in business-local calendar dates: CURRENT when dueDate exists and dueDate > asOf local date; DUE_TODAY when dueDate exists and dueDate = asOf local date; OVERDUE when dueDate exists and dueDate < asOf local date; DUE_DATE_UNKNOWN when no reliable dueDate. Ageing buckets apply only to OVERDUE using days_overdue = asOf local date minus dueDate; buckets are non-overlapping 1-30, 31-60, 61-90, 91+. |
| Status treatment | CURRENT: dueDate exists and dueDate > asOf local date. |
| Exact canonical formula | SUM open customer balances at asOf with due status CURRENT. |
| Authoritative timestamp or asOf rule | asOf; due status evaluated on business-local calendar dates. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time due-status slice of open receivable. |
| Reports action-period activity | No; balance slice, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | CURRENT slice of open receivable. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when dueDate is reliable; balances without dueDate are excluded into ar_due_date_unknown. |
| Correction and restatement treatment | Live asOf; due status may change as calendar date advances. |
| Drill-down grain | Open balances with dueDate, due status, and days_overdue when OVERDUE. |
| Reconciliation relationship | Part of ar_balance = ar_current + ar_due_today + ar_overdue + ar_due_date_unknown. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.53 ar_due_today — Receivables Due Today

| Attribute | Definition |
| --- | --- |
| Metric ID | ar_due_today |
| Canonical name | Receivables Due Today |
| Business question | What portion of ar_balance has due status DUE_TODAY at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open customer balances at asOf whose contractual dueDate exists and equals the asOf local date. |
| Inclusion and exclusion rules | Include only DUE_TODAY. Exclude CURRENT, OVERDUE, and DUE_DATE_UNKNOWN. Due status at asOf uses contractual dueDate in business-local calendar dates: CURRENT when dueDate exists and dueDate > asOf local date; DUE_TODAY when dueDate exists and dueDate = asOf local date; OVERDUE when dueDate exists and dueDate < asOf local date; DUE_DATE_UNKNOWN when no reliable dueDate. Ageing buckets apply only to OVERDUE using days_overdue = asOf local date minus dueDate; buckets are non-overlapping 1-30, 31-60, 61-90, 91+. |
| Status treatment | DUE_TODAY: dueDate exists and dueDate = asOf local date. |
| Exact canonical formula | SUM open customer balances at asOf with due status DUE_TODAY. |
| Authoritative timestamp or asOf rule | asOf; due status evaluated on business-local calendar dates. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time due-status slice of open receivable. |
| Reports action-period activity | No; balance slice, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | DUE_TODAY slice of open receivable. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when dueDate is reliable. |
| Correction and restatement treatment | Live asOf; due status may change as calendar date advances. |
| Drill-down grain | Open balances with dueDate, due status, and days_overdue when OVERDUE. |
| Reconciliation relationship | Part of ar_balance = ar_current + ar_due_today + ar_overdue + ar_due_date_unknown. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.54 ar_overdue — Overdue Receivables

| Attribute | Definition |
| --- | --- |
| Metric ID | ar_overdue |
| Canonical name | Overdue Receivables |
| Business question | What portion of ar_balance has due status OVERDUE at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open customer balances at asOf whose contractual dueDate exists and is before the asOf local date. |
| Inclusion and exclusion rules | Include only OVERDUE. Exclude CURRENT, DUE_TODAY, and DUE_DATE_UNKNOWN. Ageing buckets below partition this total only. Due status at asOf uses contractual dueDate in business-local calendar dates: CURRENT when dueDate exists and dueDate > asOf local date; DUE_TODAY when dueDate exists and dueDate = asOf local date; OVERDUE when dueDate exists and dueDate < asOf local date; DUE_DATE_UNKNOWN when no reliable dueDate. Ageing buckets apply only to OVERDUE using days_overdue = asOf local date minus dueDate; buckets are non-overlapping 1-30, 31-60, 61-90, 91+. |
| Status treatment | OVERDUE: dueDate exists and dueDate < asOf local date. days_overdue = asOf local date minus dueDate. |
| Exact canonical formula | SUM open customer balances at asOf with due status OVERDUE. |
| Authoritative timestamp or asOf rule | asOf; due status evaluated on business-local calendar dates. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time due-status slice of open receivable. |
| Reports action-period activity | No; balance slice, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | OVERDUE slice of open receivable. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when dueDate is reliable. |
| Correction and restatement treatment | Live asOf; due status may change as calendar date advances. |
| Drill-down grain | Open balances with dueDate, due status, and days_overdue when OVERDUE. |
| Reconciliation relationship | ar_overdue = ar_overdue_1_30 + ar_overdue_31_60 + ar_overdue_61_90 + ar_overdue_91_plus. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.55 ar_due_date_unknown — Receivables Due Date Unknown

| Attribute | Definition |
| --- | --- |
| Metric ID | ar_due_date_unknown |
| Canonical name | Receivables Due Date Unknown |
| Business question | What portion of ar_balance has due status DUE_DATE_UNKNOWN at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open customer balances at asOf with no reliable contractual dueDate. |
| Inclusion and exclusion rules | Include only DUE_DATE_UNKNOWN. Exclude balances that have a reliable dueDate. Due status at asOf uses contractual dueDate in business-local calendar dates: CURRENT when dueDate exists and dueDate > asOf local date; DUE_TODAY when dueDate exists and dueDate = asOf local date; OVERDUE when dueDate exists and dueDate < asOf local date; DUE_DATE_UNKNOWN when no reliable dueDate. Ageing buckets apply only to OVERDUE using days_overdue = asOf local date minus dueDate; buckets are non-overlapping 1-30, 31-60, 61-90, 91+. |
| Status treatment | DUE_DATE_UNKNOWN: no reliable dueDate. |
| Exact canonical formula | SUM open customer balances at asOf with due status DUE_DATE_UNKNOWN. |
| Authoritative timestamp or asOf rule | asOf; due status evaluated on business-local calendar dates. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time due-status slice of open receivable. |
| Reports action-period activity | No; balance slice, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | Unknown-due-date slice of open receivable. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE as a control slice when missing dueDate can be detected; dueDate is optional in schema. |
| Correction and restatement treatment | Live asOf; due status may change as calendar date advances. |
| Drill-down grain | Open balances with dueDate, due status, and days_overdue when OVERDUE. |
| Reconciliation relationship | Part of ar_balance = ar_current + ar_due_today + ar_overdue + ar_due_date_unknown. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.56 ar_overdue_1_30 — AR Overdue 1-30

| Attribute | Definition |
| --- | --- |
| Metric ID | ar_overdue_1_30 |
| Canonical name | AR Overdue 1-30 |
| Business question | What overdue receivable has days_overdue from 1 to 30 at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open customer balances at asOf with due status OVERDUE and days_overdue in [1, 30]. |
| Inclusion and exclusion rules | Include only OVERDUE balances with days_overdue in [1, 30]. Exclude CURRENT, DUE_TODAY, DUE_DATE_UNKNOWN, and OVERDUE balances outside this bucket. Do not use invoice createdAt age as a substitute for days_overdue. Due status at asOf uses contractual dueDate in business-local calendar dates: CURRENT when dueDate exists and dueDate > asOf local date; DUE_TODAY when dueDate exists and dueDate = asOf local date; OVERDUE when dueDate exists and dueDate < asOf local date; DUE_DATE_UNKNOWN when no reliable dueDate. Ageing buckets apply only to OVERDUE using days_overdue = asOf local date minus dueDate; buckets are non-overlapping 1-30, 31-60, 61-90, 91+. |
| Status treatment | OVERDUE only; days_overdue = asOf local date minus dueDate; bucket [1, 30]. |
| Exact canonical formula | SUM open customer balances at asOf with due status OVERDUE AND days_overdue in [1, 30]. |
| Authoritative timestamp or asOf rule | asOf; due status evaluated on business-local calendar dates. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time due-status slice of open receivable. |
| Reports action-period activity | No; balance slice, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | OVERDUE ageing bucket [1, 30] of open receivable. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when dueDate is reliable; proposed replacement for mixing invoice age with overdue. |
| Correction and restatement treatment | Live asOf; due status may change as calendar date advances. |
| Drill-down grain | Open balances with dueDate, due status, and days_overdue when OVERDUE. |
| Reconciliation relationship | Sum of the four overdue buckets equals ar_overdue. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.57 ar_overdue_31_60 — AR Overdue 31-60

| Attribute | Definition |
| --- | --- |
| Metric ID | ar_overdue_31_60 |
| Canonical name | AR Overdue 31-60 |
| Business question | What overdue receivable has days_overdue from 31 to 60 at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open customer balances at asOf with due status OVERDUE and days_overdue in [31, 60]. |
| Inclusion and exclusion rules | Include only OVERDUE balances with days_overdue in [31, 60]. Exclude CURRENT, DUE_TODAY, DUE_DATE_UNKNOWN, and OVERDUE balances outside this bucket. Do not use invoice createdAt age as a substitute for days_overdue. Due status at asOf uses contractual dueDate in business-local calendar dates: CURRENT when dueDate exists and dueDate > asOf local date; DUE_TODAY when dueDate exists and dueDate = asOf local date; OVERDUE when dueDate exists and dueDate < asOf local date; DUE_DATE_UNKNOWN when no reliable dueDate. Ageing buckets apply only to OVERDUE using days_overdue = asOf local date minus dueDate; buckets are non-overlapping 1-30, 31-60, 61-90, 91+. |
| Status treatment | OVERDUE only; days_overdue = asOf local date minus dueDate; bucket [31, 60]. |
| Exact canonical formula | SUM open customer balances at asOf with due status OVERDUE AND days_overdue in [31, 60]. |
| Authoritative timestamp or asOf rule | asOf; due status evaluated on business-local calendar dates. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time due-status slice of open receivable. |
| Reports action-period activity | No; balance slice, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | OVERDUE ageing bucket [31, 60] of open receivable. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when dueDate is reliable; proposed replacement for mixing invoice age with overdue. |
| Correction and restatement treatment | Live asOf; due status may change as calendar date advances. |
| Drill-down grain | Open balances with dueDate, due status, and days_overdue when OVERDUE. |
| Reconciliation relationship | Sum of the four overdue buckets equals ar_overdue. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.58 ar_overdue_61_90 — AR Overdue 61-90

| Attribute | Definition |
| --- | --- |
| Metric ID | ar_overdue_61_90 |
| Canonical name | AR Overdue 61-90 |
| Business question | What overdue receivable has days_overdue from 61 to 90 at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open customer balances at asOf with due status OVERDUE and days_overdue in [61, 90]. |
| Inclusion and exclusion rules | Include only OVERDUE balances with days_overdue in [61, 90]. Exclude CURRENT, DUE_TODAY, DUE_DATE_UNKNOWN, and OVERDUE balances outside this bucket. Do not use invoice createdAt age as a substitute for days_overdue. Due status at asOf uses contractual dueDate in business-local calendar dates: CURRENT when dueDate exists and dueDate > asOf local date; DUE_TODAY when dueDate exists and dueDate = asOf local date; OVERDUE when dueDate exists and dueDate < asOf local date; DUE_DATE_UNKNOWN when no reliable dueDate. Ageing buckets apply only to OVERDUE using days_overdue = asOf local date minus dueDate; buckets are non-overlapping 1-30, 31-60, 61-90, 91+. |
| Status treatment | OVERDUE only; days_overdue = asOf local date minus dueDate; bucket [61, 90]. |
| Exact canonical formula | SUM open customer balances at asOf with due status OVERDUE AND days_overdue in [61, 90]. |
| Authoritative timestamp or asOf rule | asOf; due status evaluated on business-local calendar dates. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time due-status slice of open receivable. |
| Reports action-period activity | No; balance slice, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | OVERDUE ageing bucket [61, 90] of open receivable. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when dueDate is reliable; proposed replacement for mixing invoice age with overdue. |
| Correction and restatement treatment | Live asOf; due status may change as calendar date advances. |
| Drill-down grain | Open balances with dueDate, due status, and days_overdue when OVERDUE. |
| Reconciliation relationship | Sum of the four overdue buckets equals ar_overdue. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.59 ar_overdue_91_plus — AR Overdue 91 Plus

| Attribute | Definition |
| --- | --- |
| Metric ID | ar_overdue_91_plus |
| Canonical name | AR Overdue 91 Plus |
| Business question | What overdue receivable has days_overdue of 91 or more at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open customer balances at asOf with due status OVERDUE and days_overdue in [91, +inf). |
| Inclusion and exclusion rules | Include only OVERDUE balances with days_overdue in [91, +inf). Exclude CURRENT, DUE_TODAY, DUE_DATE_UNKNOWN, and OVERDUE balances outside this bucket. Do not use invoice createdAt age as a substitute for days_overdue. Due status at asOf uses contractual dueDate in business-local calendar dates: CURRENT when dueDate exists and dueDate > asOf local date; DUE_TODAY when dueDate exists and dueDate = asOf local date; OVERDUE when dueDate exists and dueDate < asOf local date; DUE_DATE_UNKNOWN when no reliable dueDate. Ageing buckets apply only to OVERDUE using days_overdue = asOf local date minus dueDate; buckets are non-overlapping 1-30, 31-60, 61-90, 91+. |
| Status treatment | OVERDUE only; days_overdue = asOf local date minus dueDate; bucket [91, +inf). |
| Exact canonical formula | SUM open customer balances at asOf with due status OVERDUE AND days_overdue in [91, +inf). |
| Authoritative timestamp or asOf rule | asOf; due status evaluated on business-local calendar dates. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time due-status slice of open receivable. |
| Reports action-period activity | No; balance slice, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | OVERDUE ageing bucket [91, +inf) of open receivable. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when dueDate is reliable; proposed replacement for mixing invoice age with overdue. |
| Correction and restatement treatment | Live asOf; due status may change as calendar date advances. |
| Drill-down grain | Open balances with dueDate, due status, and days_overdue when OVERDUE. |
| Reconciliation relationship | Sum of the four overdue buckets equals ar_overdue. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.60 ar_monitoring_90d — AR Monitoring 90d created

| Attribute | Definition |
| --- | --- |
| Metric ID | ar_monitoring_90d |
| Canonical name | AR Monitoring 90d created |
| Business question | What open receivable is limited to invoices with createdAt greater than or equal to asOf minus 90 days? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open customer balances at asOf restricted to invoices with createdAt >= asOf minus 90 days. |
| Inclusion and exclusion rules | Include open balances meeting the 90-day createdAt floor. This is an explicit monitor Metric ID and must not be labelled ar_balance. |
| Status treatment | Open balances within the createdAt monitoring window. |
| Exact canonical formula | SUM open customer balances at asOf where invoice createdAt >= asOf - 90 days. |
| Authoritative timestamp or asOf rule | asOf; createdAt floor relative to asOf. |
| Period attribution | Point-in-time monitor window. |
| Restates originating transaction | No; monitoring slice of open receivable. |
| Reports action-period activity | No; balance monitor, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | Monitoring subset of receivable; not the full ar_balance. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE as an explicit monitor; must disclose it is not ar_balance. |
| Correction and restatement treatment | Live asOf. |
| Drill-down grain | Open balances inside the 90-day createdAt window. |
| Reconciliation relationship | Subset of ar_balance; must not be presented as full ar_balance. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.61 customer_collections — Customer Collections

| Attribute | Definition |
| --- | --- |
| Metric ID | customer_collections |
| Canonical name | Customer Collections |
| Business question | How much confirmed money was collected against customer invoices in the period? |
| Metric type | FLOW |
| Event or balance population | CONFIRMED SalesPayment amounts with receivedAt in period scoped to customer invoice payments. |
| Inclusion and exclusion rules | Include CONFIRMED customer invoice payments with receivedAt in period. Exclude FAILED, CANCELLED, VOID, PENDING, null, unknown. MUST NOT filter parent RETURNED/VOID invoices. Aligns with money_received inclusion rules for status and parent filters. |
| Status treatment | CONFIRMED only; parent RETURNED/VOID must not exclude. |
| Exact canonical formula | SUM CONFIRMED customer invoice payment amounts with receivedAt in period; no parent RETURNED/VOID filter. |
| Authoritative timestamp or asOf rule | receivedAt. |
| Period attribution | Payment receivedAt period. |
| Restates originating transaction | No; collection activity by receivedAt. |
| Reports action-period activity | Yes; customer collection activity. |
| Money-movement effect | Customer cash in against invoices; subset view of money_received family rules. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | Reduces open receivable when applied. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL due to parent-filter conflict on money paths. |
| Correction and restatement treatment | Historical collections remain; refunds/reversals separate. |
| Drill-down grain | Customer invoice payments. |
| Reconciliation relationship | Sum of qualifying payments equals headline. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-PAY-1 remove parent RETURNED/VOID filters from money_received query paths |
| Material-claim classification | Confirmed implementation fact |

## 5.62 customer_credit_notes — Customer Credit Notes

| Attribute | Definition |
| --- | --- |
| Metric ID | customer_credit_notes |
| Canonical name | Customer Credit Notes |
| Business question | What customer credit note amounts were issued in the period? |
| Metric type | FLOW |
| Event or balance population | Customer credit note records with effective time in period. |
| Inclusion and exclusion rules | Include authorised credit notes. Exclude unauthorised drafts. |
| Status treatment | Authorised credit notes only. |
| Exact canonical formula | SUM customer credit note amounts with effective time in period. |
| Authoritative timestamp or asOf rule | Credit note effective time. |
| Period attribution | Action period of the credit note. |
| Restates originating transaction | No; credit note activity in its effective period. |
| Reports action-period activity | Yes; credit note issuance activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | Reduces receivable or creates payable depending on note economics. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED without a general credit-note entity. |
| Correction and restatement treatment | Remains in effective period. |
| Drill-down grain | Credit note rows linked to customer. |
| Reconciliation relationship | Sum of credit note amounts equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-CN-1 general customer credit-note and payable ledger |
| Material-claim classification | Requires accounting decision |

## 5.63 customer_balance_adjustments — Customer Balance Adjustments

| Attribute | Definition |
| --- | --- |
| Metric ID | customer_balance_adjustments |
| Canonical name | Customer Balance Adjustments |
| Business question | What authorised customer balance adjustments occurred in the period? |
| Metric type | FLOW |
| Event or balance population | Authorised customer balance adjustment records with effective time in period. |
| Inclusion and exclusion rules | Include authorised adjustments only. Exclude silent balance edits without audit. |
| Status treatment | Authorised adjustments only. |
| Exact canonical formula | SUM authorised customer balance adjustments with effective time in period. |
| Authoritative timestamp or asOf rule | Adjustment effective time. |
| Period attribution | Action period of the adjustment. |
| Restates originating transaction | No; adjustment activity in its effective period. |
| Reports action-period activity | Yes; customer balance adjustment activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | Changes open receivable by the authorised adjustment amount. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED if adjustment ledger unsupported. |
| Correction and restatement treatment | Remains in effective period; requires audit trail. |
| Drill-down grain | Authorised adjustment rows. |
| Reconciliation relationship | Sum of adjustments equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-CN-1 customer obligation/adjustment ledger capability |
| Material-claim classification | Requires accounting decision |

## 5.64 customer_credit_payable — Customer Credit Payable

| Attribute | Definition |
| --- | --- |
| Metric ID | customer_credit_payable |
| Canonical name | Customer Credit Payable |
| Business question | What point-in-time amount is payable to the customer (for example authorised under-refund remainder) at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open customer credit payable / liability balances at asOf. |
| Inclusion and exclusion rules | Include authorised amounts payable to customers such as under-refund remainders. Must not silently drop obligations when cash refund is below returned charge. |
| Status treatment | Open payable to customer at asOf. |
| Exact canonical formula | SUM open customer credit payable balances at asOf. |
| Authoritative timestamp or asOf rule | asOf. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time customer liability. |
| Reports action-period activity | No; balance, not period activity. |
| Money-movement effect | Liability may later settle via refund_outflows or other settlement; not itself money_received. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | Customer-side obligation distinct from ar_balance receivable. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED; must not fabricate zero when under-refund exists. |
| Correction and restatement treatment | Live asOf once ledger exists. |
| Drill-down grain | Customer payable rows with origin sale/return/refund link. |
| Reconciliation relationship | Sum of open payable rows equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-CN-1 general customer credit payable ledger |
| Material-claim classification | Requires accounting decision |

## 5.65 ap_balance — Payables Balance

| Attribute | Definition |
| --- | --- |
| Metric ID | ap_balance |
| Canonical name | Payables Balance |
| Business question | What is the full open supplier payable balance at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open supplier balances at asOf after valid purchases, payments, credits, and authorised adjustments; full open set with no silent 90-day createdAt floor. |
| Inclusion and exclusion rules | Include all open supplier payable balances in scope. Exclude using a 90-day createdAt floor (that is ap_monitoring_90d). |
| Status treatment | Open balances only at asOf. |
| Exact canonical formula | SUM open supplier balances at asOf after valid purchases, payments, credits, and authorised adjustments. |
| Authoritative timestamp or asOf rule | asOf. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time open payable balance. |
| Reports action-period activity | No; balance, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL if Command Center applies a 90-day floor; that path must not use this Metric ID. |
| Correction and restatement treatment | Live asOf. |
| Drill-down grain | Open supplier balance rows. |
| Reconciliation relationship | ap_balance = ap_current + ap_due_today + ap_overdue + ap_due_date_unknown. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.66 ap_current — Current Payables

| Attribute | Definition |
| --- | --- |
| Metric ID | ap_current |
| Canonical name | Current Payables |
| Business question | What portion of ap_balance has due status CURRENT at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open supplier balances at asOf whose contractual dueDate exists and dueDate is after the asOf local date. |
| Inclusion and exclusion rules | Include only CURRENT due status. Exclude DUE_TODAY, OVERDUE, and DUE_DATE_UNKNOWN. Due status at asOf uses contractual dueDate in business-local calendar dates: CURRENT when dueDate exists and dueDate > asOf local date; DUE_TODAY when dueDate exists and dueDate = asOf local date; OVERDUE when dueDate exists and dueDate < asOf local date; DUE_DATE_UNKNOWN when no reliable dueDate. Ageing buckets apply only to OVERDUE using days_overdue = asOf local date minus dueDate; buckets are non-overlapping 1-30, 31-60, 61-90, 91+. |
| Status treatment | CURRENT: dueDate exists and dueDate > asOf local date. |
| Exact canonical formula | SUM open supplier balances at asOf with due status CURRENT. |
| Authoritative timestamp or asOf rule | asOf; due status evaluated on business-local calendar dates. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time due-status slice of open payable. |
| Reports action-period activity | No; balance slice, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when dueDate is reliable; balances without dueDate go to ap_due_date_unknown. |
| Correction and restatement treatment | Live asOf; due status may change as calendar date advances. |
| Drill-down grain | Open supplier balances with dueDate, due status, and days_overdue when OVERDUE. |
| Reconciliation relationship | Part of ap_balance = ap_current + ap_due_today + ap_overdue + ap_due_date_unknown. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.67 ap_due_today — Payables Due Today

| Attribute | Definition |
| --- | --- |
| Metric ID | ap_due_today |
| Canonical name | Payables Due Today |
| Business question | What portion of ap_balance has due status DUE_TODAY at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open supplier balances at asOf whose contractual dueDate exists and equals the asOf local date. |
| Inclusion and exclusion rules | Include only DUE_TODAY. Exclude CURRENT, OVERDUE, and DUE_DATE_UNKNOWN. Due status at asOf uses contractual dueDate in business-local calendar dates: CURRENT when dueDate exists and dueDate > asOf local date; DUE_TODAY when dueDate exists and dueDate = asOf local date; OVERDUE when dueDate exists and dueDate < asOf local date; DUE_DATE_UNKNOWN when no reliable dueDate. Ageing buckets apply only to OVERDUE using days_overdue = asOf local date minus dueDate; buckets are non-overlapping 1-30, 31-60, 61-90, 91+. |
| Status treatment | DUE_TODAY: dueDate exists and dueDate = asOf local date. |
| Exact canonical formula | SUM open supplier balances at asOf with due status DUE_TODAY. |
| Authoritative timestamp or asOf rule | asOf; due status evaluated on business-local calendar dates. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time due-status slice of open payable. |
| Reports action-period activity | No; balance slice, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when dueDate is reliable. |
| Correction and restatement treatment | Live asOf; due status may change as calendar date advances. |
| Drill-down grain | Open supplier balances with dueDate, due status, and days_overdue when OVERDUE. |
| Reconciliation relationship | Part of ap_balance = ap_current + ap_due_today + ap_overdue + ap_due_date_unknown. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.68 ap_overdue — Overdue Payables

| Attribute | Definition |
| --- | --- |
| Metric ID | ap_overdue |
| Canonical name | Overdue Payables |
| Business question | What portion of ap_balance has due status OVERDUE at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open supplier balances at asOf whose contractual dueDate exists and is before the asOf local date. |
| Inclusion and exclusion rules | Include only OVERDUE. Exclude CURRENT, DUE_TODAY, and DUE_DATE_UNKNOWN. Ageing buckets below partition this total only. Due status at asOf uses contractual dueDate in business-local calendar dates: CURRENT when dueDate exists and dueDate > asOf local date; DUE_TODAY when dueDate exists and dueDate = asOf local date; OVERDUE when dueDate exists and dueDate < asOf local date; DUE_DATE_UNKNOWN when no reliable dueDate. Ageing buckets apply only to OVERDUE using days_overdue = asOf local date minus dueDate; buckets are non-overlapping 1-30, 31-60, 61-90, 91+. |
| Status treatment | OVERDUE: dueDate exists and dueDate < asOf local date. days_overdue = asOf local date minus dueDate. |
| Exact canonical formula | SUM open supplier balances at asOf with due status OVERDUE. |
| Authoritative timestamp or asOf rule | asOf; due status evaluated on business-local calendar dates. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time due-status slice of open payable. |
| Reports action-period activity | No; balance slice, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when dueDate is reliable. |
| Correction and restatement treatment | Live asOf; due status may change as calendar date advances. |
| Drill-down grain | Open supplier balances with dueDate, due status, and days_overdue when OVERDUE. |
| Reconciliation relationship | ap_overdue = ap_overdue_1_30 + ap_overdue_31_60 + ap_overdue_61_90 + ap_overdue_91_plus. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.69 ap_due_date_unknown — Payables Due Date Unknown

| Attribute | Definition |
| --- | --- |
| Metric ID | ap_due_date_unknown |
| Canonical name | Payables Due Date Unknown |
| Business question | What portion of ap_balance has due status DUE_DATE_UNKNOWN at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open supplier balances at asOf with no reliable contractual dueDate. |
| Inclusion and exclusion rules | Include only DUE_DATE_UNKNOWN. Exclude balances that have a reliable dueDate. Due status at asOf uses contractual dueDate in business-local calendar dates: CURRENT when dueDate exists and dueDate > asOf local date; DUE_TODAY when dueDate exists and dueDate = asOf local date; OVERDUE when dueDate exists and dueDate < asOf local date; DUE_DATE_UNKNOWN when no reliable dueDate. Ageing buckets apply only to OVERDUE using days_overdue = asOf local date minus dueDate; buckets are non-overlapping 1-30, 31-60, 61-90, 91+. |
| Status treatment | DUE_DATE_UNKNOWN: no reliable dueDate. |
| Exact canonical formula | SUM open supplier balances at asOf with due status DUE_DATE_UNKNOWN. |
| Authoritative timestamp or asOf rule | asOf; due status evaluated on business-local calendar dates. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time due-status slice of open payable. |
| Reports action-period activity | No; balance slice, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE as a control slice when missing dueDate can be detected. |
| Correction and restatement treatment | Live asOf; due status may change as calendar date advances. |
| Drill-down grain | Open supplier balances with dueDate, due status, and days_overdue when OVERDUE. |
| Reconciliation relationship | Part of ap_balance = ap_current + ap_due_today + ap_overdue + ap_due_date_unknown. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.70 ap_overdue_1_30 — AP Overdue 1-30

| Attribute | Definition |
| --- | --- |
| Metric ID | ap_overdue_1_30 |
| Canonical name | AP Overdue 1-30 |
| Business question | What overdue payable has days_overdue from 1 to 30 at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open supplier balances at asOf with due status OVERDUE and days_overdue in [1, 30]. |
| Inclusion and exclusion rules | Include only OVERDUE balances with days_overdue in [1, 30]. Exclude CURRENT, DUE_TODAY, DUE_DATE_UNKNOWN, and OVERDUE balances outside this bucket. Do not use invoice createdAt age as a substitute for days_overdue. Due status at asOf uses contractual dueDate in business-local calendar dates: CURRENT when dueDate exists and dueDate > asOf local date; DUE_TODAY when dueDate exists and dueDate = asOf local date; OVERDUE when dueDate exists and dueDate < asOf local date; DUE_DATE_UNKNOWN when no reliable dueDate. Ageing buckets apply only to OVERDUE using days_overdue = asOf local date minus dueDate; buckets are non-overlapping 1-30, 31-60, 61-90, 91+. |
| Status treatment | OVERDUE only; days_overdue = asOf local date minus dueDate; bucket [1, 30]. |
| Exact canonical formula | SUM open supplier balances at asOf with due status OVERDUE AND days_overdue in [1, 30]. |
| Authoritative timestamp or asOf rule | asOf; due status evaluated on business-local calendar dates. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time due-status slice of open payable. |
| Reports action-period activity | No; balance slice, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when dueDate is reliable. |
| Correction and restatement treatment | Live asOf; due status may change as calendar date advances. |
| Drill-down grain | Open supplier balances with dueDate, due status, and days_overdue when OVERDUE. |
| Reconciliation relationship | Sum of the four overdue buckets equals ap_overdue. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.71 ap_overdue_31_60 — AP Overdue 31-60

| Attribute | Definition |
| --- | --- |
| Metric ID | ap_overdue_31_60 |
| Canonical name | AP Overdue 31-60 |
| Business question | What overdue payable has days_overdue from 31 to 60 at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open supplier balances at asOf with due status OVERDUE and days_overdue in [31, 60]. |
| Inclusion and exclusion rules | Include only OVERDUE balances with days_overdue in [31, 60]. Exclude CURRENT, DUE_TODAY, DUE_DATE_UNKNOWN, and OVERDUE balances outside this bucket. Do not use invoice createdAt age as a substitute for days_overdue. Due status at asOf uses contractual dueDate in business-local calendar dates: CURRENT when dueDate exists and dueDate > asOf local date; DUE_TODAY when dueDate exists and dueDate = asOf local date; OVERDUE when dueDate exists and dueDate < asOf local date; DUE_DATE_UNKNOWN when no reliable dueDate. Ageing buckets apply only to OVERDUE using days_overdue = asOf local date minus dueDate; buckets are non-overlapping 1-30, 31-60, 61-90, 91+. |
| Status treatment | OVERDUE only; days_overdue = asOf local date minus dueDate; bucket [31, 60]. |
| Exact canonical formula | SUM open supplier balances at asOf with due status OVERDUE AND days_overdue in [31, 60]. |
| Authoritative timestamp or asOf rule | asOf; due status evaluated on business-local calendar dates. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time due-status slice of open payable. |
| Reports action-period activity | No; balance slice, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when dueDate is reliable. |
| Correction and restatement treatment | Live asOf; due status may change as calendar date advances. |
| Drill-down grain | Open supplier balances with dueDate, due status, and days_overdue when OVERDUE. |
| Reconciliation relationship | Sum of the four overdue buckets equals ap_overdue. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.72 ap_overdue_61_90 — AP Overdue 61-90

| Attribute | Definition |
| --- | --- |
| Metric ID | ap_overdue_61_90 |
| Canonical name | AP Overdue 61-90 |
| Business question | What overdue payable has days_overdue from 61 to 90 at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open supplier balances at asOf with due status OVERDUE and days_overdue in [61, 90]. |
| Inclusion and exclusion rules | Include only OVERDUE balances with days_overdue in [61, 90]. Exclude CURRENT, DUE_TODAY, DUE_DATE_UNKNOWN, and OVERDUE balances outside this bucket. Do not use invoice createdAt age as a substitute for days_overdue. Due status at asOf uses contractual dueDate in business-local calendar dates: CURRENT when dueDate exists and dueDate > asOf local date; DUE_TODAY when dueDate exists and dueDate = asOf local date; OVERDUE when dueDate exists and dueDate < asOf local date; DUE_DATE_UNKNOWN when no reliable dueDate. Ageing buckets apply only to OVERDUE using days_overdue = asOf local date minus dueDate; buckets are non-overlapping 1-30, 31-60, 61-90, 91+. |
| Status treatment | OVERDUE only; days_overdue = asOf local date minus dueDate; bucket [61, 90]. |
| Exact canonical formula | SUM open supplier balances at asOf with due status OVERDUE AND days_overdue in [61, 90]. |
| Authoritative timestamp or asOf rule | asOf; due status evaluated on business-local calendar dates. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time due-status slice of open payable. |
| Reports action-period activity | No; balance slice, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when dueDate is reliable. |
| Correction and restatement treatment | Live asOf; due status may change as calendar date advances. |
| Drill-down grain | Open supplier balances with dueDate, due status, and days_overdue when OVERDUE. |
| Reconciliation relationship | Sum of the four overdue buckets equals ap_overdue. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.73 ap_overdue_91_plus — AP Overdue 91 Plus

| Attribute | Definition |
| --- | --- |
| Metric ID | ap_overdue_91_plus |
| Canonical name | AP Overdue 91 Plus |
| Business question | What overdue payable has days_overdue of 91 or more at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open supplier balances at asOf with due status OVERDUE and days_overdue in [91, +inf). |
| Inclusion and exclusion rules | Include only OVERDUE balances with days_overdue in [91, +inf). Exclude CURRENT, DUE_TODAY, DUE_DATE_UNKNOWN, and OVERDUE balances outside this bucket. Do not use invoice createdAt age as a substitute for days_overdue. Due status at asOf uses contractual dueDate in business-local calendar dates: CURRENT when dueDate exists and dueDate > asOf local date; DUE_TODAY when dueDate exists and dueDate = asOf local date; OVERDUE when dueDate exists and dueDate < asOf local date; DUE_DATE_UNKNOWN when no reliable dueDate. Ageing buckets apply only to OVERDUE using days_overdue = asOf local date minus dueDate; buckets are non-overlapping 1-30, 31-60, 61-90, 91+. |
| Status treatment | OVERDUE only; days_overdue = asOf local date minus dueDate; bucket [91, +inf). |
| Exact canonical formula | SUM open supplier balances at asOf with due status OVERDUE AND days_overdue in [91, +inf). |
| Authoritative timestamp or asOf rule | asOf; due status evaluated on business-local calendar dates. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time due-status slice of open payable. |
| Reports action-period activity | No; balance slice, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when dueDate is reliable. |
| Correction and restatement treatment | Live asOf; due status may change as calendar date advances. |
| Drill-down grain | Open supplier balances with dueDate, due status, and days_overdue when OVERDUE. |
| Reconciliation relationship | Sum of the four overdue buckets equals ap_overdue. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.74 ap_monitoring_90d — AP Monitoring 90d created

| Attribute | Definition |
| --- | --- |
| Metric ID | ap_monitoring_90d |
| Canonical name | AP Monitoring 90d created |
| Business question | What open payable is limited to invoices with createdAt greater than or equal to asOf minus 90 days? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open supplier balances at asOf restricted to invoices with createdAt >= asOf minus 90 days. |
| Inclusion and exclusion rules | Include open balances meeting the 90-day createdAt floor. Explicit monitor only; must not be labelled ap_balance. |
| Status treatment | Open balances within the createdAt monitoring window. |
| Exact canonical formula | SUM open supplier balances at asOf where invoice createdAt >= asOf - 90 days. |
| Authoritative timestamp or asOf rule | asOf; createdAt floor relative to asOf. |
| Period attribution | Point-in-time monitor window. |
| Restates originating transaction | No; monitoring slice of open payable. |
| Reports action-period activity | No; balance monitor, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE as an explicit monitor; must disclose it is not ap_balance. |
| Correction and restatement treatment | Live asOf. |
| Drill-down grain | Open balances inside the 90-day createdAt window. |
| Reconciliation relationship | Subset of ap_balance; must not be presented as full ap_balance. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.75 purchases_value — Purchases Value

| Attribute | Definition |
| --- | --- |
| Metric ID | purchases_value |
| Canonical name | Purchases Value |
| Business question | What purchase invoice totals were recorded in the period? |
| Metric type | FLOW |
| Event or balance population | Purchase invoices with authoritative purchase time in period. |
| Inclusion and exclusion rules | Include purchase invoice totals in period. Exclude voided/cancelled purchases per purchase model rules. |
| Status treatment | Posted purchase invoices. |
| Exact canonical formula | SUM purchase invoice totals with purchase time in period. |
| Authoritative timestamp or asOf rule | Purchase invoice authoritative time (createdAt/postedAt per purchase model). |
| Period attribution | Purchase activity period. |
| Restates originating transaction | No; purchase activity in its period. |
| Reports action-period activity | Yes; purchase value activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Companion stock_received records inbound quantity. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when purchase model totals exist. |
| Correction and restatement treatment | Remains in purchase period; corrections use authorised purchase credit/adjustment paths. |
| Drill-down grain | Purchase invoice rows. |
| Reconciliation relationship | Sum of purchase totals equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.76 supplier_payments — Supplier Payments

| Attribute | Definition |
| --- | --- |
| Metric ID | supplier_payments |
| Canonical name | Supplier Payments |
| Business question | What supplier purchase payments were paid in the period by paidAt? |
| Metric type | FLOW |
| Event or balance population | Purchase payments with paidAt in period. |
| Inclusion and exclusion rules | Include confirmed/posted purchase payments. Exclude failed payment attempts. |
| Status treatment | Posted payments by paidAt. |
| Exact canonical formula | SUM purchase payment amounts where paidAt is in period. |
| Authoritative timestamp or asOf rule | paidAt. |
| Period attribution | Payment paidAt period. |
| Restates originating transaction | No; supplier payment activity by paidAt. |
| Reports action-period activity | Yes; supplier payment activity. |
| Money-movement effect | Supplier cash out; equals supplier_payment_outflows. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when purchase payment paidAt exists. |
| Correction and restatement treatment | Remains in paidAt period. |
| Drill-down grain | Purchase payment rows. |
| Reconciliation relationship | Sum of payment amounts equals headline; equals supplier_payment_outflows. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.77 supplier_credits — Supplier Credits

| Attribute | Definition |
| --- | --- |
| Metric ID | supplier_credits |
| Canonical name | Supplier Credits |
| Business question | What supplier credit amounts were recorded in the period? |
| Metric type | FLOW |
| Event or balance population | Supplier credit records with effective time in period. |
| Inclusion and exclusion rules | Include authorised supplier credits. Exclude drafts. |
| Status treatment | Authorised supplier credits. |
| Exact canonical formula | SUM supplier credit amounts with effective time in period. |
| Authoritative timestamp or asOf rule | Credit effective time. |
| Period attribution | Action period of the credit. |
| Restates originating transaction | No; supplier credit activity. |
| Reports action-period activity | Yes; supplier credit activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED if supplier credit entity unsupported. |
| Correction and restatement treatment | Remains in effective period. |
| Drill-down grain | Supplier credit rows. |
| Reconciliation relationship | Sum of credits equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | Supplier credit entity / AP credit capability not generally available |
| Material-claim classification | Requires accounting decision |

## 5.78 supplier_balance_adjustments — Supplier Balance Adjustments

| Attribute | Definition |
| --- | --- |
| Metric ID | supplier_balance_adjustments |
| Canonical name | Supplier Balance Adjustments |
| Business question | What authorised supplier balance adjustments occurred in the period? |
| Metric type | FLOW |
| Event or balance population | Authorised AP adjustments with effective time in period. |
| Inclusion and exclusion rules | Include authorised adjustments only. |
| Status treatment | Authorised adjustments only. |
| Exact canonical formula | SUM authorised supplier balance adjustments with effective time in period. |
| Authoritative timestamp or asOf rule | Adjustment effective time. |
| Period attribution | Action period of the adjustment. |
| Restates originating transaction | No; adjustment activity. |
| Reports action-period activity | Yes; supplier balance adjustment activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED if AP adjustment ledger unsupported. |
| Correction and restatement treatment | Remains in effective period; requires audit trail. |
| Drill-down grain | Authorised AP adjustment rows. |
| Reconciliation relationship | Sum of adjustments equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | Authorised supplier balance adjustment ledger capability |
| Material-claim classification | Requires accounting decision |

## 5.79 operating_expenses_recorded — OpEx Recorded

| Attribute | Definition |
| --- | --- |
| Metric ID | operating_expenses_recorded |
| Canonical name | OpEx Recorded |
| Business question | What operating expense amounts were recorded by createdAt in the period? |
| Metric type | FLOW |
| Event or balance population | Expense rows with createdAt in period. |
| Inclusion and exclusion rules | Include Expense.amountPence by createdAt. This is recorded-date activity, not incurred-date. |
| Status treatment | Posted expenses by createdAt. |
| Exact canonical formula | SUM Expense.amountPence where createdAt is in period. |
| Authoritative timestamp or asOf rule | Expense.createdAt. |
| Period attribution | Recorded activity period. |
| Restates originating transaction | No; recorded-date activity. |
| Reports action-period activity | Yes; OpEx recorded activity by createdAt. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | Operating expense recorded-date total; not operating_result until incurred companion exists. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE for Expense.createdAt path. |
| Correction and restatement treatment | Remains in createdAt period. |
| Drill-down grain | Expense rows by createdAt. |
| Reconciliation relationship | Sum of expense amounts equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.80 operating_expenses_incurred — OpEx Incurred

| Attribute | Definition |
| --- | --- |
| Metric ID | operating_expenses_incurred |
| Canonical name | OpEx Incurred |
| Business question | What operating expense amounts were incurred by incurredAt in the period? |
| Metric type | FLOW |
| Event or balance population | Expense rows with incurredAt in period. |
| Inclusion and exclusion rules | Include expenses by incurredAt only. Do not substitute createdAt or dueDate as incurred. Until incurredAt exists, do not fabricate this Metric ID. |
| Status treatment | Requires incurredAt field. |
| Exact canonical formula | SUM Expense.amountPence where incurredAt is in period. |
| Authoritative timestamp or asOf rule | incurredAt. |
| Period attribution | Incurred activity period. |
| Restates originating transaction | No; incurred-date activity. |
| Reports action-period activity | Yes; OpEx incurred activity by incurredAt. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | Accrual OpEx input to operating_result. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED; recorded-date interim must use operating_expenses_recorded with disclosure. |
| Correction and restatement treatment | Attributed to incurred period once incurredAt exists. |
| Drill-down grain | Expense rows by incurredAt. |
| Reconciliation relationship | Sum of incurred amounts equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-EXP-1 Expense.incurredAt field |
| Material-claim classification | Requires accounting decision |

## 5.81 operating_expenses_paid — OpEx Paid

| Attribute | Definition |
| --- | --- |
| Metric ID | operating_expenses_paid |
| Canonical name | OpEx Paid |
| Business question | What operating expense payments were paid by paidAt in the period? |
| Metric type | FLOW |
| Event or balance population | ExpensePayment rows with paidAt in period. |
| Inclusion and exclusion rules | Include expense payments by paidAt. Exclude unpaid expenses. |
| Status treatment | Posted expense payments. |
| Exact canonical formula | SUM ExpensePayment amounts where paidAt is in period. |
| Authoritative timestamp or asOf rule | paidAt. |
| Period attribution | Payment paidAt period. |
| Restates originating transaction | No; paid activity by paidAt. |
| Reports action-period activity | Yes; OpEx paid activity. |
| Money-movement effect | Cash out for expenses when paid from cash paths. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | Cash settlement of OpEx; distinct from incurred and recorded. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when ExpensePayment.paidAt exists. |
| Correction and restatement treatment | Remains in paidAt period. |
| Drill-down grain | ExpensePayment rows. |
| Reconciliation relationship | Sum of paid amounts equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.82 operating_expenses_unpaid — OpEx Unpaid

| Attribute | Definition |
| --- | --- |
| Metric ID | operating_expenses_unpaid |
| Canonical name | OpEx Unpaid |
| Business question | What open unpaid expense balances exist at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Open expense balances at asOf using paymentStatus. |
| Inclusion and exclusion rules | Include unpaid open expense balances. Exclude fully paid expenses. |
| Status treatment | Uses expense paymentStatus for open unpaid. |
| Exact canonical formula | SUM open unpaid expense balances at asOf. |
| Authoritative timestamp or asOf rule | asOf. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time unpaid expense balance. |
| Reports action-period activity | No; balance, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | Unpaid OpEx outstanding. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when paymentStatus distinguishes unpaid. |
| Correction and restatement treatment | Live asOf. |
| Drill-down grain | Unpaid expense rows. |
| Reconciliation relationship | Sum of open unpaid equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.83 expense_reversals — Expense Reversals

| Attribute | Definition |
| --- | --- |
| Metric ID | expense_reversals |
| Canonical name | Expense Reversals |
| Business question | What expense reversal amounts occurred in the period? |
| Metric type | FLOW |
| Event or balance population | Expense reversal rows with reversal time in period. |
| Inclusion and exclusion rules | Include authorised expense reversals. Exclude ordinary expense refunds/recoveries. |
| Status treatment | Authorised reversals only. |
| Exact canonical formula | SUM expense reversal amounts with reversal time in period. |
| Authoritative timestamp or asOf rule | Reversal time. |
| Period attribution | Action period of the reversal. |
| Restates originating transaction | No; reversal activity in its period. |
| Reports action-period activity | Yes; expense reversal activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | Reverses previously recognised OpEx components per reversal rules. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED without reversal rows. |
| Correction and restatement treatment | Remains in reversal period. |
| Drill-down grain | Expense reversal rows. |
| Reconciliation relationship | Sum of reversals equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | Expense reversal ledger rows not generally available |
| Material-claim classification | Requires accounting decision |

## 5.84 expense_refunds — Expense Refunds Recoveries

| Attribute | Definition |
| --- | --- |
| Metric ID | expense_refunds |
| Canonical name | Expense Refunds Recoveries |
| Business question | What expense recovery/refund amounts occurred in the period? |
| Metric type | FLOW |
| Event or balance population | Expense recovery/refund rows with recovery time in period. |
| Inclusion and exclusion rules | Include recoveries. Exclude expense reversals. |
| Status treatment | Authorised recoveries only. |
| Exact canonical formula | SUM expense recovery amounts with recovery time in period. |
| Authoritative timestamp or asOf rule | Recovery time. |
| Period attribution | Action period of the recovery. |
| Restates originating transaction | No; recovery activity. |
| Reports action-period activity | Yes; expense recovery activity. |
| Money-movement effect | Cash in when recovery is monetary. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | Offsets OpEx when recovery recognised. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED without recovery rows. |
| Correction and restatement treatment | Remains in recovery period. |
| Drill-down grain | Expense recovery rows. |
| Reconciliation relationship | Sum of recoveries equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | Expense recovery/refund ledger rows not generally available |
| Material-claim classification | Requires accounting decision |

## 5.85 inventory_purchase_cash_outflows — Inventory Purchase Cash Outflows

| Attribute | Definition |
| --- | --- |
| Metric ID | inventory_purchase_cash_outflows |
| Canonical name | Inventory Purchase Cash Outflows |
| Business question | What cash outflows for inventory purchases occurred in the period by paidAt? |
| Metric type | FLOW |
| Event or balance population | Purchase payments in period by paidAt that settle inventory purchases. |
| Inclusion and exclusion rules | Include purchase payments settling inventory purchases. Exclude OpEx payments. |
| Status treatment | Posted purchase payments. |
| Exact canonical formula | SUM purchase payment amounts with paidAt in period for inventory purchases. |
| Authoritative timestamp or asOf rule | paidAt. |
| Period attribution | Payment paidAt period. |
| Restates originating transaction | No; cash outflow activity. |
| Reports action-period activity | Yes; inventory purchase cash outflow activity. |
| Money-movement effect | Cash out for inventory purchases. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when purchase payments exist. |
| Correction and restatement treatment | Remains in paidAt period. |
| Drill-down grain | Purchase payment rows for inventory. |
| Reconciliation relationship | Sum equals headline; aligns with supplier_payments when all payments are inventory purchases. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.86 supplier_payment_outflows — Supplier Payment Outflows

| Attribute | Definition |
| --- | --- |
| Metric ID | supplier_payment_outflows |
| Canonical name | Supplier Payment Outflows |
| Business question | What supplier payment outflows occurred in the period? |
| Metric type | FLOW |
| Event or balance population | Equals supplier_payments population for the period. |
| Inclusion and exclusion rules | Include all supplier_payments amounts for the period. |
| Status treatment | Posted supplier payments. |
| Exact canonical formula | Equals supplier_payments for the matching period and scope. |
| Authoritative timestamp or asOf rule | paidAt. |
| Period attribution | Payment paidAt period. |
| Restates originating transaction | No; cash outflow activity. |
| Reports action-period activity | Yes; supplier payment outflow activity. |
| Money-movement effect | Cash out to suppliers; equals supplier_payments. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Tax-inclusive amounts in integer minor units unless a component tax field is explicitly present. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when supplier_payments is COMPLETE. |
| Correction and restatement treatment | Remains in paidAt period. |
| Drill-down grain | Supplier payment rows. |
| Reconciliation relationship | Must equal supplier_payments for the shared scope. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.87 other_classified_cash_outflows — Other Classified Cash Outflows

| Attribute | Definition |
| --- | --- |
| Metric ID | other_classified_cash_outflows |
| Canonical name | Other Classified Cash Outflows |
| Business question | What classified cash outflows in the period are neither purchase nor OpEx? |
| Metric type | FLOW |
| Event or balance population | Classified cash outflow entries not purchase and not OpEx, with entry time in period. |
| Inclusion and exclusion rules | Include classified outs outside purchase and opex. Exclude unclassified outs. |
| Status treatment | Classified non-purchase non-opex outs. |
| Exact canonical formula | SUM classified cash outflow amounts excluding purchase and opex, entry time in period. |
| Authoritative timestamp or asOf rule | Entry time. |
| Period attribution | Entry activity period. |
| Restates originating transaction | No; outflow activity. |
| Reports action-period activity | Yes; other classified outflow activity. |
| Money-movement effect | Classified cash out. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL until classification completeness is proven across all outs. |
| Correction and restatement treatment | Remains in entry period. |
| Drill-down grain | Classified outflow rows. |
| Reconciliation relationship | Sum of classified other outs equals headline. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Strong repository inference |

## 5.88 unclassified_cash_outflows — Unclassified Cash Outflows

| Attribute | Definition |
| --- | --- |
| Metric ID | unclassified_cash_outflows |
| Canonical name | Unclassified Cash Outflows |
| Business question | What cash outflows in the period lack classification? |
| Metric type | FLOW |
| Event or balance population | Cash outflow entries lacking classification with entry time in period. |
| Inclusion and exclusion rules | Include outs without classification. Control metric; should trend to zero. |
| Status treatment | Unclassified outs only. |
| Exact canonical formula | SUM cash outflow amounts lacking classification with entry time in period. |
| Authoritative timestamp or asOf rule | Entry time. |
| Period attribution | Entry activity period. |
| Restates originating transaction | No; control outflow activity. |
| Reports action-period activity | Yes; unclassified outflow activity. |
| Money-movement effect | Unclassified cash out. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE as a control metric when unclassified outs can be detected. |
| Correction and restatement treatment | Classify then move to the appropriate classified Metric ID. |
| Drill-down grain | Unclassified outflow rows. |
| Reconciliation relationship | Sum of unclassified outs equals headline. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Proposed universal rule |

## 5.89 operating_result — Operating Result

| Attribute | Definition |
| --- | --- |
| Metric ID | operating_result |
| Canonical name | Operating Result |
| Business question | What operating result equals gross_profit_complete minus operating_expenses_incurred? |
| Metric type | FLOW |
| Event or balance population | Derived from gross_profit_complete and operating_expenses_incurred for the period. |
| Inclusion and exclusion rules | Defined only when both gross_profit_complete and operating_expenses_incurred are available. Do not substitute recorded OpEx silently. |
| Status treatment | UNAVAILABLE until both components are available. |
| Exact canonical formula | gross_profit_complete - operating_expenses_incurred. |
| Authoritative timestamp or asOf rule | Derived from components. |
| Period attribution | Matching period as components. |
| Restates originating transaction | Yes; uses restated complete GP and incurred OpEx for the period. |
| Reports action-period activity | No; derived operating result, not a raw activity total. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | Canonical operating result from complete GP minus incurred OpEx. |
| Tax basis | Tax-exclusive revenue components only; do not invent tax splits from inclusive totals. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED until both components are available. |
| Correction and restatement treatment | Recomputes when components change. |
| Drill-down grain | Component GP and incurred OpEx rows. |
| Reconciliation relationship | Must equal component arithmetic. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-EXP-1 incurredAt; also requires gross_profit_complete availability |
| Material-claim classification | Requires accounting decision |

## 5.90 inventory_qty — Quantity on Hand

| Attribute | Definition |
| --- | --- |
| Metric ID | inventory_qty |
| Canonical name | Quantity on Hand |
| Business question | What inventory quantity is on hand at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Inventory balance quantities at asOf. |
| Inclusion and exclusion rules | Include on-hand qty. Exclude reserved-available distinctions (see inventory_qty_available). |
| Status treatment | On-hand balances. |
| Exact canonical formula | SUM inventory balance qty at asOf. |
| Authoritative timestamp or asOf rule | asOf. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time on-hand quantity. |
| Reports action-period activity | No; balance, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | On-hand quantity. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE. |
| Correction and restatement treatment | Live asOf from movements. |
| Drill-down grain | Inventory balance rows. |
| Reconciliation relationship | Sum of on-hand qty equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.91 inventory_qty_available — Available Quantity

| Attribute | Definition |
| --- | --- |
| Metric ID | inventory_qty_available |
| Canonical name | Available Quantity |
| Business question | What inventory quantity is available (on-hand minus reserved) at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | On-hand minus reserved quantities at asOf when a reservation model exists. |
| Inclusion and exclusion rules | Include available qty only when reservations are modelled. Do not invent reservations. |
| Status treatment | Requires reservation model. |
| Exact canonical formula | SUM (on_hand_qty - reserved_qty) at asOf when reservation model exists. |
| Authoritative timestamp or asOf rule | asOf. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time available quantity. |
| Reports action-period activity | No; balance, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Available quantity after reservations. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED when no reservation model exists. |
| Correction and restatement treatment | Live asOf once reservations exist. |
| Drill-down grain | On-hand and reserved qty rows. |
| Reconciliation relationship | Sum of available qty equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | Inventory reservation model not present |
| Material-claim classification | Requires product decision |

## 5.92 inventory_value — Inventory Value

| Attribute | Definition |
| --- | --- |
| Metric ID | inventory_value |
| Canonical name | Inventory Value |
| Business question | What inventory value equals on-hand qty times reliable cost at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Inventory balances with reliable cost at asOf. |
| Inclusion and exclusion rules | Include qty * reliable cost. Missing cost makes the metric INCOMPLETE; missing is not zero. |
| Status treatment | Reliable-costed on-hand only for COMPLETE. |
| Exact canonical formula | SUM (on_hand_qty * reliable_unit_cost) at asOf. |
| Authoritative timestamp or asOf rule | asOf. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time inventory value. |
| Reports action-period activity | No; balance, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | On-hand inventory value at reliable cost. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | INCOMPLETE without reliable costs on all lines. |
| Correction and restatement treatment | Live asOf. |
| Drill-down grain | Balance qty and unit cost with provenance. |
| Reconciliation relationship | Sum of line values equals headline when COMPLETE. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Strong repository inference |

## 5.93 inventory_value_available — Available Inventory Value

| Attribute | Definition |
| --- | --- |
| Metric ID | inventory_value_available |
| Canonical name | Available Inventory Value |
| Business question | What available inventory value equals available qty times reliable cost at asOf? |
| Metric type | POINT_IN_TIME_BALANCE |
| Event or balance population | Available qty with reliable cost at asOf when reservation model exists. |
| Inclusion and exclusion rules | Include available_qty * reliable cost. Requires reservation model and reliable costs. |
| Status treatment | Requires reservation model. |
| Exact canonical formula | SUM (available_qty * reliable_unit_cost) at asOf. |
| Authoritative timestamp or asOf rule | asOf. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; point-in-time available inventory value. |
| Reports action-period activity | No; balance, not period activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Available inventory value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED without reservation model. |
| Correction and restatement treatment | Live asOf once available. |
| Drill-down grain | Available qty and unit cost. |
| Reconciliation relationship | Sum of available line values equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | Inventory reservation model not present |
| Material-claim classification | Requires product decision |

## 5.94 stock_received — Stock Received

| Attribute | Definition |
| --- | --- |
| Metric ID | stock_received |
| Canonical name | Stock Received |
| Business question | What stock quantity was received in the period by movement records? |
| Metric type | FLOW |
| Event or balance population | Inbound purchase or opening stock movements with movement time in period. |
| Inclusion and exclusion rules | Include inbound purchase/opening movement qty. Exclude sales and adjustments. |
| Status treatment | Posted inbound movement types. |
| Exact canonical formula | SUM inbound purchase or opening movement qty with movement time in period. |
| Authoritative timestamp or asOf rule | Movement time. |
| Period attribution | Movement activity period. |
| Restates originating transaction | No; stock receipt activity. |
| Reports action-period activity | Yes; stock received activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Increases on-hand quantity. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE for confirmed movement types. |
| Correction and restatement treatment | Remains in movement period. |
| Drill-down grain | Inbound movement rows. |
| Reconciliation relationship | Sum of inbound qty equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.95 stock_sold — Stock Sold

| Attribute | Definition |
| --- | --- |
| Metric ID | stock_sold |
| Canonical name | Stock Sold |
| Business question | What stock quantity was sold in the period by SALE movements? |
| Metric type | FLOW |
| Event or balance population | SALE stock movements with movement time in period. |
| Inclusion and exclusion rules | Include SALE movement qty. Exclude returns and adjustments. |
| Status treatment | Posted SALE movements. |
| Exact canonical formula | SUM SALE movement qty with movement time in period. |
| Authoritative timestamp or asOf rule | Movement time. |
| Period attribution | Movement activity period. |
| Restates originating transaction | No; stock sold activity. |
| Reports action-period activity | Yes; stock sold activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Quantity sold activity companion; restated sales use units_sold_restated. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Decreases on-hand quantity. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE for SALE movements. |
| Correction and restatement treatment | Remains in movement period. |
| Drill-down grain | SALE movement rows. |
| Reconciliation relationship | Sum of SALE qty equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.96 stock_customer_returns_saleable — Customer Returns into Saleable Stock

| Attribute | Definition |
| --- | --- |
| Metric ID | stock_customer_returns_saleable |
| Canonical name | Customer Returns into Saleable Stock |
| Business question | What returned quantity entered saleable stock in the period? |
| Metric type | FLOW |
| Event or balance population | Return movements into saleable on-hand with returnEffectiveAt in period. |
| Inclusion and exclusion rules | Include saleable restock return qty. Today all returns restock saleable; damaged disposition is gated separately. |
| Status treatment | Saleable restock movements. |
| Exact canonical formula | SUM SALES_RETURN (or equivalent) movements into saleable on-hand with returnEffectiveAt in period. |
| Authoritative timestamp or asOf rule | returnEffectiveAt / movement time. |
| Period attribution | Return action period. |
| Restates originating transaction | No; saleable restock activity. |
| Reports action-period activity | Yes; customer return into saleable stock activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Increases saleable on-hand. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL because damaged intent is not distinguished and always restocks saleable today. |
| Correction and restatement treatment | Remains in return effective period. |
| Drill-down grain | Saleable return movement rows. |
| Reconciliation relationship | Sum of saleable return qty equals headline. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-RET-2 damaged disposition (until then all returns appear saleable) |
| Material-claim classification | Confirmed implementation fact |

## 5.97 stock_damaged_returns_qty — Damaged Return Quantity

| Attribute | Definition |
| --- | --- |
| Metric ID | stock_damaged_returns_qty |
| Canonical name | Damaged Return Quantity |
| Business question | What returned quantity was damaged in the period? |
| Metric type | FLOW |
| Event or balance population | Damaged disposition return quantities with returnEffectiveAt in period. |
| Inclusion and exclusion rules | Include damaged disposition qty only. Do not treat always-saleable restock as damaged. |
| Status treatment | Requires damaged disposition enum/path. |
| Exact canonical formula | SUM damaged disposition qty with returnEffectiveAt in period. |
| Authoritative timestamp or asOf rule | returnEffectiveAt. |
| Period attribution | Return action period. |
| Restates originating transaction | No; damaged return activity. |
| Reports action-period activity | Yes; damaged return quantity activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Does not restore saleable on-hand; records damaged movement. |
| COGS effect | Pairs with COGS reverse on damaged returns and damaged_stock_writeoff_loss. |
| Gross Profit or expense effect | Pairs with damaged_stock_writeoff_loss in the return-effective period. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED while returns always restock saleable. |
| Correction and restatement treatment | Remains in return effective period once disposition exists. |
| Drill-down grain | Damaged disposition return rows. |
| Reconciliation relationship | Sum of damaged qty equals headline. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-RET-2 damaged disposition enum and write-off movement |
| Material-claim classification | Requires accounting decision |

## 5.98 stock_damaged_returns_value — Damaged Return Value at Cost

| Attribute | Definition |
| --- | --- |
| Metric ID | stock_damaged_returns_value |
| Canonical name | Damaged Return Value at Cost |
| Business question | What sale-time cost attaches to damaged returns in the period? |
| Metric type | FLOW |
| Event or balance population | Damaged disposition returns with immutable sale-time unit cost and returnEffectiveAt in period. |
| Inclusion and exclusion rules | Include damaged qty * immutable sale-time unit cost. Missing cost is not zero without EXPLICIT_ZERO provenance. |
| Status treatment | Requires damaged disposition and reliable sale-time cost. |
| Exact canonical formula | SUM (damaged qty * immutable sale-time unit cost) with returnEffectiveAt in period. |
| Authoritative timestamp or asOf rule | returnEffectiveAt. |
| Period attribution | Return action period. |
| Restates originating transaction | No; damaged return cost activity (restated sales/COGS companions handle originating period). |
| Reports action-period activity | Yes; damaged return cost activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Damaged movement at cost; not saleable restock. |
| COGS effect | Returned unit removed from restated COGS; loss recognised via damaged_stock_writeoff_loss. |
| Gross Profit or expense effect | Equals damaged_stock_writeoff_loss for the period when both available. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED. |
| Correction and restatement treatment | Remains in return effective period. |
| Drill-down grain | Damaged qty and sale-time unit cost. |
| Reconciliation relationship | Sum equals headline; equals damaged_stock_writeoff_loss when both available. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-RET-2 damaged disposition and write-off movement |
| Material-claim classification | Requires accounting decision |

## 5.99 stock_supplier_returns — Supplier Returns

| Attribute | Definition |
| --- | --- |
| Metric ID | stock_supplier_returns |
| Canonical name | Supplier Returns |
| Business question | What quantity was returned to suppliers in the period? |
| Metric type | FLOW |
| Event or balance population | PURCHASE_RETURN movements with movement time in period. |
| Inclusion and exclusion rules | Include PURCHASE_RETURN movement qty. |
| Status treatment | Posted PURCHASE_RETURN movements. |
| Exact canonical formula | SUM PURCHASE_RETURN movement qty with movement time in period. |
| Authoritative timestamp or asOf rule | Movement time. |
| Period attribution | Movement activity period. |
| Restates originating transaction | No; supplier return activity. |
| Reports action-period activity | Yes; supplier return stock activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Decreases on-hand for supplier returns. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE; PURCHASE_RETURN type exists. |
| Correction and restatement treatment | Remains in movement period. |
| Drill-down grain | PURCHASE_RETURN movement rows. |
| Reconciliation relationship | Sum of supplier return qty equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.100 stock_transfers — Stock Transfers

| Attribute | Definition |
| --- | --- |
| Metric ID | stock_transfers |
| Canonical name | Stock Transfers |
| Business question | What transfer movements occurred in the period? |
| Metric type | FLOW |
| Event or balance population | TRANSFER movements with movement time in period. |
| Inclusion and exclusion rules | Include TRANSFER movements. Multi-store feature dependent for cross-branch. |
| Status treatment | Posted TRANSFER movements. |
| Exact canonical formula | SUM TRANSFER movement qty with movement time in period. |
| Authoritative timestamp or asOf rule | Movement time. |
| Period attribution | Movement activity period. |
| Restates originating transaction | No; transfer activity. |
| Reports action-period activity | Yes; stock transfer activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Moves quantity between locations; net business on-hand may be unchanged. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE when TRANSFER movements are posted; multi-store scope dependent. |
| Correction and restatement treatment | Remains in movement period. |
| Drill-down grain | TRANSFER movement rows. |
| Reconciliation relationship | Sum of transfer qty equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.101 stock_adjustments — Stock Adjustments

| Attribute | Definition |
| --- | --- |
| Metric ID | stock_adjustments |
| Canonical name | Stock Adjustments |
| Business question | What adjustment or stocktake movements occurred in the period? |
| Metric type | FLOW |
| Event or balance population | ADJUSTMENT or STOCKTAKE movements with movement time in period. |
| Inclusion and exclusion rules | Include ADJUSTMENT and STOCKTAKE movement qty. |
| Status treatment | Posted adjustment/stocktake movements. |
| Exact canonical formula | SUM ADJUSTMENT and STOCKTAKE movement qty with movement time in period. |
| Authoritative timestamp or asOf rule | Movement time. |
| Period attribution | Movement activity period. |
| Restates originating transaction | No; adjustment activity. |
| Reports action-period activity | Yes; stock adjustment activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Adjusts on-hand quantity. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE for confirmed adjustment types. |
| Correction and restatement treatment | Remains in movement period. |
| Drill-down grain | ADJUSTMENT/STOCKTAKE rows. |
| Reconciliation relationship | Sum of adjustment qty equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.102 stock_writeoffs — Write-off Stock

| Attribute | Definition |
| --- | --- |
| Metric ID | stock_writeoffs |
| Canonical name | Write-off Stock |
| Business question | What write-off movements occurred in the period? |
| Metric type | FLOW |
| Event or balance population | Write-off stock movements with movement time in period. |
| Inclusion and exclusion rules | Include write-off movements. Distinct from damaged return disposition until DEP-RET-2 unifies paths. |
| Status treatment | Posted write-off movements. |
| Exact canonical formula | SUM write-off movement qty with movement time in period. |
| Authoritative timestamp or asOf rule | Movement time. |
| Period attribution | Movement activity period. |
| Restates originating transaction | No; write-off activity. |
| Reports action-period activity | Yes; stock write-off activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Decreases on-hand via write-off. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | May pair with loss recognition depending on write-off economics. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL depending on write-off type coverage. |
| Correction and restatement treatment | Remains in movement period. |
| Drill-down grain | Write-off movement rows. |
| Reconciliation relationship | Sum of write-off qty equals headline. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Strong repository inference |

## 5.103 low_stock_count — Low Stock Count

| Attribute | Definition |
| --- | --- |
| Metric ID | low_stock_count |
| Canonical name | Low Stock Count |
| Business question | How many tracked lines are low stock at asOf? |
| Metric type | COUNT |
| Event or balance population | Tracked inventory lines classified low at asOf. |
| Inclusion and exclusion rules | Include lines meeting the low-stock classifier. Exclude stockouts counted in out_of_stock_count if classifiers are disjoint. |
| Status treatment | Classifier-driven. |
| Exact canonical formula | COUNT tracked lines classified low at asOf. |
| Authoritative timestamp or asOf rule | asOf. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; live classifier count. |
| Reports action-period activity | No; point-in-time count. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Control count of low lines. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | DISTINCT_COUNT |
| Data-quality requirement | COMPLETE via operational-metrics classifier. |
| Correction and restatement treatment | Live asOf. |
| Drill-down grain | Low-stock line rows. |
| Reconciliation relationship | Count of low lines equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.104 out_of_stock_count — Out of Stock Count

| Attribute | Definition |
| --- | --- |
| Metric ID | out_of_stock_count |
| Canonical name | Out of Stock Count |
| Business question | How many tracked lines are stockout at asOf? |
| Metric type | COUNT |
| Event or balance population | Tracked inventory lines classified stockout at asOf. |
| Inclusion and exclusion rules | Include stockout lines per classifier. |
| Status treatment | Classifier-driven. |
| Exact canonical formula | COUNT tracked lines classified stockout at asOf. |
| Authoritative timestamp or asOf rule | asOf. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; live classifier count. |
| Reports action-period activity | No; point-in-time count. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Control count of stockout lines. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | DISTINCT_COUNT |
| Data-quality requirement | COMPLETE. |
| Correction and restatement treatment | Live asOf. |
| Drill-down grain | Stockout line rows. |
| Reconciliation relationship | Count of stockout lines equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.105 reorder_suggestion_count — Reorder Suggestion Count

| Attribute | Definition |
| --- | --- |
| Metric ID | reorder_suggestion_count |
| Canonical name | Reorder Suggestion Count |
| Business question | How many reorder suggestions exist for the scope at asOf? |
| Metric type | COUNT |
| Event or balance population | Reorder suggestion queue entries at asOf. |
| Inclusion and exclusion rules | Include open reorder suggestions in scope. |
| Status treatment | Open suggestions. |
| Exact canonical formula | COUNT reorder suggestions at asOf. |
| Authoritative timestamp or asOf rule | asOf. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; live suggestion count. |
| Reports action-period activity | No; point-in-time count. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Control count of reorder suggestions. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | DISTINCT_COUNT |
| Data-quality requirement | COMPLETE via reorder surface. |
| Correction and restatement treatment | Live asOf. |
| Drill-down grain | Reorder suggestion rows. |
| Reconciliation relationship | Count of suggestions equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.106 stock_movement_count — Stock Movement Count

| Attribute | Definition |
| --- | --- |
| Metric ID | stock_movement_count |
| Canonical name | Stock Movement Count |
| Business question | How many stock movements occurred in the period? |
| Metric type | COUNT |
| Event or balance population | Stock movements with movement time in period. |
| Inclusion and exclusion rules | Include all stock movements in period for scope. |
| Status treatment | Posted movements. |
| Exact canonical formula | COUNT stock movements with movement time in period. |
| Authoritative timestamp or asOf rule | Movement time. |
| Period attribution | Movement activity period. |
| Restates originating transaction | No; movement activity count. |
| Reports action-period activity | Yes; stock movement count activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Count of inventory movements. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE. |
| Correction and restatement treatment | Remains in movement period. |
| Drill-down grain | Stock movement rows. |
| Reconciliation relationship | Count of movements equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.107 momo_unreconciled — Unreconciled MoMo

| Attribute | Definition |
| --- | --- |
| Metric ID | momo_unreconciled |
| Canonical name | Unreconciled MoMo |
| Business question | How many MoMo collections are pending at asOf? |
| Metric type | COUNT |
| Event or balance population | PENDING mobile money collections at asOf. |
| Inclusion and exclusion rules | Include PENDING MoMo collections. Exclude CONFIRMED and FAILED/CANCELLED. |
| Status treatment | PENDING only. |
| Exact canonical formula | COUNT PENDING mobile money collections at asOf. |
| Authoritative timestamp or asOf rule | asOf. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; live pending MoMo count. |
| Reports action-period activity | No; point-in-time count. |
| Money-movement effect | Control count for unconfirmed MoMo; not money_received. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | DISTINCT_COUNT |
| Data-quality requirement | COMPLETE. |
| Correction and restatement treatment | Live asOf. |
| Drill-down grain | PENDING MoMo collection rows. |
| Reconciliation relationship | Count of PENDING MoMo equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.108 risk_open_high — Open High Risk Alerts

| Attribute | Definition |
| --- | --- |
| Metric ID | risk_open_high |
| Canonical name | Open High Risk Alerts |
| Business question | How many HIGH OPEN risk alerts exist at asOf? |
| Metric type | COUNT |
| Event or balance population | RiskAlert rows with severity HIGH and status OPEN at asOf. |
| Inclusion and exclusion rules | Include HIGH + OPEN only. |
| Status treatment | HIGH and OPEN. |
| Exact canonical formula | COUNT RiskAlert with severity HIGH and status OPEN at asOf. |
| Authoritative timestamp or asOf rule | asOf. |
| Period attribution | Point-in-time asOf. |
| Restates originating transaction | No; live risk alert count. |
| Reports action-period activity | No; point-in-time count. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | DISTINCT_COUNT |
| Data-quality requirement | COMPLETE; RiskAlert schema confirmed. |
| Correction and restatement treatment | Live asOf. |
| Drill-down grain | HIGH OPEN RiskAlert rows. |
| Reconciliation relationship | Count equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.109 discount_override_count — Discount Override Count

| Attribute | Definition |
| --- | --- |
| Metric ID | discount_override_count |
| Canonical name | Discount Override Count |
| Business question | How many discount overrides occurred in the period? |
| Metric type | COUNT |
| Event or balance population | Sales with discount override reason in period. |
| Inclusion and exclusion rules | Include sales that recorded a discount override reason in period. |
| Status treatment | Override-reason present. |
| Exact canonical formula | COUNT sales with discount override reason in period. |
| Authoritative timestamp or asOf rule | Sale createdAt or override time in period. |
| Period attribution | Override activity period. |
| Restates originating transaction | No; override activity count. |
| Reports action-period activity | Yes; discount override activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | Control signal on sales with overrides. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | COMPLETE via Command Center override signal. |
| Correction and restatement treatment | Remains in activity period. |
| Drill-down grain | Sales with override reason. |
| Reconciliation relationship | Count equals headline. |
| Current-support classification | CURRENTLY SUPPORTED |
| Exact unresolved dependency | NONE |
| Material-claim classification | Confirmed implementation fact |

## 5.110 unusual_refunds_count — Unusual Refunds Count

| Attribute | Definition |
| --- | --- |
| Metric ID | unusual_refunds_count |
| Canonical name | Unusual Refunds Count |
| Business question | How many refunds exceed the policy threshold in the period? |
| Metric type | COUNT |
| Event or balance population | Refunds above the configured policy threshold with refundEffectiveAt in period. |
| Inclusion and exclusion rules | Include refunds with amount above policy threshold. Threshold amount requires an explicit product policy. |
| Status treatment | Refunds exceeding threshold. |
| Exact canonical formula | COUNT refunds with amount > policy_threshold and refundEffectiveAt in period. |
| Authoritative timestamp or asOf rule | refundEffectiveAt. |
| Period attribution | Refund action period. |
| Restates originating transaction | No; unusual refund activity count. |
| Reports action-period activity | Yes; unusual refund activity. |
| Money-movement effect | Control count over refund_outflows population. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL until policy threshold is product-decided and configured. |
| Correction and restatement treatment | Remains in refund period. |
| Drill-down grain | Refund rows above threshold. |
| Reconciliation relationship | Count equals headline. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | NONE |
| Material-claim classification | Requires product decision |

## 5.111 damaged_stock_writeoff_loss — Damaged Stock Write-off Loss

| Attribute | Definition |
| --- | --- |
| Metric ID | damaged_stock_writeoff_loss |
| Canonical name | Damaged Stock Write-off Loss |
| Business question | What P and L loss equals damaged returned cost in the action period? |
| Metric type | FLOW |
| Event or balance population | Damaged returns in period; equals stock_damaged_returns_value for those returns. |
| Inclusion and exclusion rules | Include damaged return cost loss in the return-effective period. Reverse returned unit out of restated sales and restated COGS; do not restore saleable inventory; recognise equal damaged_stock_writeoff_loss. |
| Status treatment | Requires damaged disposition path. |
| Exact canonical formula | Equals stock_damaged_returns_value for damaged returns with returnEffectiveAt in period. |
| Authoritative timestamp or asOf rule | returnEffectiveAt. |
| Period attribution | Return action period. |
| Restates originating transaction | No; action-period P and L loss; originating restated COGS/sales companions handle sale-period restatement. |
| Reports action-period activity | Yes; damaged write-off loss activity in the return-effective period. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | Evidence of damaged movement; not saleable restock. |
| COGS effect | Paired with COGS reverse on damaged returns. |
| Gross Profit or expense effect | Expense/loss in the action period equal to damaged return cost. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | ADDITIVE |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED. |
| Correction and restatement treatment | Remains in return-effective period once disposition exists. |
| Drill-down grain | Damaged return cost rows. |
| Reconciliation relationship | Must equal stock_damaged_returns_value for the shared scope. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-RET-2 damaged disposition enum and write-off movement |
| Material-claim classification | Requires accounting decision |

## 5.112 cache_source_revision — Cache Source Revision

| Attribute | Definition |
| --- | --- |
| Metric ID | cache_source_revision |
| Canonical name | Cache Source Revision |
| Business question | What sourceRevision identifies the data watermark of a cached result? |
| Metric type | QUALITY_INDICATOR |
| Event or balance population | Cached metric result payloads that claim a sourceRevision stamp. |
| Inclusion and exclusion rules | Include opaque sourceRevision tokens stamped on cached results. Cached headlines may claim reconciliation to detail only when Metric ID, definitionVersion, scope, timezone, period or asOf, sourceRevision, and calculationRevision are compatible. |
| Status treatment | Present when stamped; missing stamp makes freshness non-canonical. |
| Exact canonical formula | Opaque revision token stamped on the cached result (sourceRevision). |
| Authoritative timestamp or asOf rule | generatedAt of the cache payload alongside sourceRevision. |
| Period attribution | Applies to the cached result identity, not a business flow period. |
| Restates originating transaction | No; cache identity indicator. |
| Reports action-period activity | No; not business activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | IDENTITY |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL on unstable_cache wrappers that omit sourceRevision stamps. |
| Correction and restatement treatment | On sourceRevision incompatibility: invalidate cached headline; recompute; if recompute fails expose STALE_UNAVAILABLE. Staleness is not a rounding excuse. |
| Drill-down grain | Cache payload stamps: sourceRevision, definitionVersion, calculationRevision, scope. |
| Reconciliation relationship | Headline and detail may reconcile only with compatible revision stamps. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-VER-1 stamp definitionVersion and sourceRevision on cache and export payloads |
| Material-claim classification | Proposed universal rule |

## 5.113 cache_freshness — Cache Freshness

| Attribute | Definition |
| --- | --- |
| Metric ID | cache_freshness |
| Canonical name | Cache Freshness |
| Business question | Is the cached result fresh relative to compatible sourceRevision and definitionVersion? |
| Metric type | QUALITY_INDICATOR |
| Event or balance population | Cached metric results evaluated for revision compatibility at read time. |
| Inclusion and exclusion rules | Fresh only when Metric ID, definitionVersion, scope, timezone, period or asOf, sourceRevision, and calculationRevision are compatible with detail. Staleness must not be excused by rounding. |
| Status treatment | FRESH when stamps compatible; otherwise invalidate and recompute; on recompute failure STALE_UNAVAILABLE. |
| Exact canonical formula | Boolean/state freshness from revision compatibility check; sequence: detect incompatibility; invalidate; recompute; else STALE_UNAVAILABLE. |
| Authoritative timestamp or asOf rule | Evaluated at cache read/serve time against current source watermark. |
| Period attribution | Applies to the cached result being served. |
| Restates originating transaction | No; freshness quality indicator. |
| Reports action-period activity | No; not business activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | IDENTITY |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL without stable revision stamps on unstable_cache. |
| Correction and restatement treatment | Failed recompute after stale detection yields STALE_UNAVAILABLE with no current canonical figure. |
| Drill-down grain | Compatibility tuple of revision stamps. |
| Reconciliation relationship | Fresh caches may claim exact integer reconcile to detail; stale must not. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-VER-1 stamp definitionVersion and sourceRevision on cache payloads |
| Material-claim classification | Proposed universal rule |

## 5.114 cache_quality_state — Cache Quality State

| Attribute | Definition |
| --- | --- |
| Metric ID | cache_quality_state |
| Canonical name | Cache Quality State |
| Business question | What explicit quality state does the cached or computed result expose? |
| Metric type | QUALITY_INDICATOR |
| Event or balance population | Metric results exposing quality vocabulary state. |
| Inclusion and exclusion rules | Include explicit states from: COMPLETE; INCOMPLETE; ESTIMATED analytical only; UNRECONCILED; UNVERIFIED; UNAVAILABLE; NOT_APPLICABLE; UNAVAILABLE_UNTIL_DEPENDENCY; STALE_UNAVAILABLE. Do not invent silent success. |
| Status treatment | One explicit quality state per result. |
| Exact canonical formula | qualityState enum on the result payload. |
| Authoritative timestamp or asOf rule | generatedAt of the result. |
| Period attribution | Applies to the result being served. |
| Restates originating transaction | No; quality indicator. |
| Reports action-period activity | No; not business activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | IDENTITY |
| Data-quality requirement | PARTIALLY SUPPORTED — NON-CANONICAL until all cache paths stamp qualityState with revision identity. |
| Correction and restatement treatment | STALE_UNAVAILABLE on failed recompute after stale cache; never round away staleness. |
| Drill-down grain | Result qualityState and dependency ids when UNAVAILABLE_UNTIL_DEPENDENCY. |
| Reconciliation relationship | Quality state must match whether headline/detail reconciliation is claimed. |
| Current-support classification | PARTIALLY SUPPORTED — NON-CANONICAL |
| Exact unresolved dependency | DEP-VER-1 quality and revision stamps on cache payloads |
| Material-claim classification | Proposed universal rule |

## 5.115 snapshot_identity — Snapshot Identity

| Attribute | Definition |
| --- | --- |
| Metric ID | snapshot_identity |
| Canonical name | Snapshot Identity |
| Business question | What immutable identity names a delivered or exported snapshot? |
| Metric type | IMMUTABLE_SNAPSHOT |
| Event or balance population | Delivered or exported immutable snapshot baselines. |
| Inclusion and exclusion rules | Include snapshotId plus definitionVersion plus generatedAt plus embedded scope and timezone. Weekly digest today is live cache and must not be labelled as this Metric ID. |
| Status treatment | Immutable once delivered; live caches are not snapshots. |
| Exact canonical formula | snapshotId + definitionVersion + generatedAt + embedded scope + timezone. |
| Authoritative timestamp or asOf rule | generatedAt of the delivered snapshot. |
| Period attribution | Snapshot delivery identity; not a live asOf recompute. |
| Restates originating transaction | No; immutable delivered identity. |
| Reports action-period activity | No; not business activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | IDENTITY |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED for digest immutability; DayClosure exists but weekly digest is live cache. |
| Correction and restatement treatment | Immutable after delivery; later live recomputes do not mutate snapshot_identity. |
| Drill-down grain | Snapshot header fields. |
| Reconciliation relationship | A dated snapshot may remain visible without claiming current reconciliation to live detail. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-SNAP-1 persist immutable delivery snapshots for digest/export baselines |
| Material-claim classification | Requires product decision |

## 5.116 snapshot_value — Snapshot Value

| Attribute | Definition |
| --- | --- |
| Metric ID | snapshot_value |
| Canonical name | Snapshot Value |
| Business question | What immutable metric values are embedded in a delivered snapshot baseline? |
| Metric type | IMMUTABLE_SNAPSHOT |
| Event or balance population | Metric values persisted inside a delivered snapshot identified by snapshot_identity. |
| Inclusion and exclusion rules | Include values frozen at snapshot delivery. Weekly digest live cache values must not be labelled snapshot_value. Do not mutate after delivery. |
| Status treatment | Immutable delivered baseline values. |
| Exact canonical formula | Embedded metric values keyed by Metric ID inside snapshot_identity payload. |
| Authoritative timestamp or asOf rule | generatedAt of the parent snapshot_identity. |
| Period attribution | Frozen at snapshot delivery; not live asOf. |
| Restates originating transaction | No; immutable delivered values (may contain restated Metric IDs as frozen numbers). |
| Reports action-period activity | No; not live activity. |
| Money-movement effect | None. This Metric ID is not a money-movement total. |
| Sales effect | None. This Metric ID does not recognise or restate sales. |
| Receivable or customer-obligation effect | None. This Metric ID does not change receivables or customer obligations. |
| Inventory effect | None. This Metric ID does not change inventory quantity or value. |
| COGS effect | None. This Metric ID does not enter COGS. |
| Gross Profit or expense effect | None. This Metric ID is not Gross Profit or operating expense. |
| Tax basis | Not a tax amount; tax basis is not applicable. |
| Currency and rounding rule | Business currency from Business.currency; store and aggregate in integer minor units (pence); convert for display once; never round intermediate floats into canonical totals. |
| Branch and business scope | Scoped to the requested businessId and branchId set; multi-branch aggregates sum only authorised branches in scope; never silently drop branches. |
| Aggregation class | IDENTITY |
| Data-quality requirement | UNAVAILABLE UNTIL DEPENDENCY RESOLVED until immutable digest/export snapshots exist. |
| Correction and restatement treatment | Never rewrite delivered snapshot_value; issue a new snapshot_identity for a new baseline. |
| Drill-down grain | Per-Metric ID values inside the snapshot payload. |
| Reconciliation relationship | Snapshot values reconcile to the detail frozen at delivery, not to later live detail. |
| Current-support classification | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact unresolved dependency | DEP-SNAP-1 persist immutable delivery snapshots for digest/export baselines |
| Material-claim classification | Requires product decision |

# 6. Payment, refund and reversal contract

| Event or status | Economic meaning | Money Received treatment | Refund treatment | Reversal treatment | Effective timestamp | Parent-sale dependency | Quality | Drill-down | Current capability | Final rule status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CONFIRMED payment | Valid receipt | Include in money_received | None | None | receivedAt | Independent of later RETURNED or VOID | COMPLETE | Payment row | status default CONFIRMED | Proposed universal rule |
| PENDING | Not confirmed | Exclude; pending_payments_value | None | None | Pending time | None | UNRECONCILED | Collection or payment | MoMo PENDING exists | Confirmed plus rule |
| FAILED | Failed attempt | Never | None | None | Attempt time | None | None | Payment | Excluded in Trading Weekly clarity tests | Confirmed intent |
| CANCELLED | Cancelled before success | Never | None | None | Cancel time | None | None | Payment | Same | Confirmed intent |
| Abandoned | Abandoned attempt | Never | None | None | Attempt time | None | None | Payment | Map into CANCELLED or FAILED | Proposed |
| Null or unknown status | Unverified | unverified_legacy_receipts only | None | None | receivedAt | None | UNVERIFIED | Payment | Must not silent-default to CONFIRMED | Proposed |
| Ordinary refund | Intentional customer repay | Historical receipt remains | refund_outflows | Must not use reversal metric | refundEffectiveAt | May link sale or return | COMPLETE | Refund or return money-out row | SalesReturn.refundAmountPence | Confirmed and separated |
| Payment reversal | Unwind of confirmed settlement such as chargeback or provider reversal | Historical CONFIRMED row remains in original period | Must not use refund metric | payment_reversal_outflows | reversalEffectiveAt | Link original payment id | COMPLETE | Reversal plus original payment | No first-class reversal; owner cleanup may delete payments | UNAVAILABLE UNTIL DEPENDENCY |
| Receipt then sale returned | History preserved | Keep receipt in money_received | Separate refund if paid | Separate if chargeback | Dual timestamps | Independent classification | COMPLETE | Payment plus return | Parent filter non-conformant today | Proposed |

Refund means intentional money-out to a customer. Payment reversal means invalidation or unwind of a previously confirmed settlement. They never share one event ID or one Metric ID.

---

# 7. Return contract

Current capability is Confirmed as whole-invoice only: SalesReturn.salesInvoiceId is unique; createSalesReturn restocks all lines as saleable; refundAmountPence may be 0 through totalPaid; invoice becomes RETURNED or VOID (lib/services/returns.ts; schema SalesReturn).

| Return scenario | Sales effect | Receipt or refund effect | Receivable effect | Inventory effect | COGS and profit effect | Tax and discount | Period treatment | Required grain | Current capability |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Complete return with full refund | Restated net removes full allocated amounts | money_received kept; refund_outflows equals refund | Clear sale AR | Saleable plus all lines today | Reverse retained COGS and GP for returned amounts | Reverse allocated tax and discount | Restated sale period plus activity period | Return plus lines when exist | Whole-sale supported |
| Complete return with partial refund | Same sales removal | refund_outflows equals partial; remainder to customer_credit_payable when authorised | Clear sale AR; open payable for under-refund | Per disposition | Reverse returned merchandise economics | Allocate | Dual Metric IDs | Same | Refund amount supported; payable ledger gated |
| Complete return with no refund on unpaid credit sale | Restated net removes sale | money_received 0; refund_outflows 0 | AR reduces by returned charge | Per disposition | Reverse returned economics | Allocate | Dual | Same | Whole-sale supported |
| Partial quantity or line return | Reduce only allocated line portions | Refund optional and independent | Reduce AR only for returned charge portion | Partial qty | Partial COGS and GP | Allocate discount and tax to returned qty | Dual | Sale-line plus return-line | UNAVAILABLE UNTIL DEPENDENCY |
| Refund without stock return | Restated sales unchanged unless separate return exists | refund_outflows only | Per policy | No stock movement | No stock-path COGS reverse | None from stock | Action money | Refund without return | UNAVAILABLE UNTIL DEPENDENCY |
| Damaged return | Restated sales reduce by merchandise return value | Refund rules independent | Per payment state | No saleable increase; damaged write-off movement | Restate remove unit from COGS; recognise write-off expense at sale-time cost in action period | Allocate | Dual | Disposition plus lines | UNAVAILABLE UNTIL DEPENDENCY |

Damaged-return cost treatment applied consistently: reverse the returned unit out of restated sales and restated COGS; do not restore saleable inventory; record damaged movement at immutable sale-time unit cost; recognise equal damaged write-off expense in the return-effective period so cost does not disappear.

---

# 8. Cost completeness and provenance contract

Eligible population for coverage is remaining recognised line value in the restated revenue_excl_tax_restated set asOf.

| Cost state | Meaning | Reliable for gross_profit_complete | Coverage treatment | Display treatment | Correction treatment | Current detectability | Required dependency |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CAPTURED_LAYER | From inventory layer at sale | Yes | In numerator | None | Immutable preferred; audited revision | Partial via lineCost greater than 0 | Provenance field |
| MANUALLY_CONFIRMED | User confirmed | Yes | In numerator | None | Audit | Via repair | Flag |
| MIGRATED_VERIFIED | Verified import | Yes | In numerator | None | None | No | Flag |
| EXPLICIT_ZERO | Genuine free zero | Yes | In numerator | Show zero | None | No; zero ambiguous today | Provenance |
| INFERRED | Master or defaultCost substitute | No | Out of canonical | Analytical only | None | financials.ts defaultCost fallback | Ban in canonical |
| MISSING | No cost | No | Out | List in drill-down | Capture cost | lineCost less than or equal to 0 without flag | Provenance |
| INVALID | Negative or corrupt | No | Out | Fix | Validation | Possible | Validation |

Coverage formula: cost_coverage_pct equals 100 times sum of remaining lineSubtotal with reliable cost divided by sum of remaining eligible lineSubtotal.

Seventy percent example: eligible remaining value 1000; reliable 700 including EXPLICIT_ZERO 50; missing 300. cost_coverage_pct equals 70. gross_profit_complete is UNAVAILABLE. gross_profit_on_costed_sales shows profit on 700 only with required warning. Extrapolated estimates must not be labelled Gross Profit.

---

# 9. Sales, revenue, discount and tax contract

| Metric | Tax basis | Discount basis | Return basis | Formula basis | Business use | Accounting limitation | Current support | Final terminology |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gross_sales_incl_tax_restated | Incl | Before discounts on retained qty | Line return allocations asOf | Section 5 | Ops ticketing restated | Not formal revenue | Partial return gated | Never call revenue |
| discounts_incl_tax_restated | Incl | Allocated retained discount | Line allocations | Section 5 | Ops | None | Gated for partial | None |
| net_sales_before_returns_incl_tax | Incl | After discounts | Ignores later returns | Invoice totalPence | Historical ticket | Includes tax | Trading-like | Not restated net |
| net_sales_incl_tax_restated | Incl | After discounts | Line allocations asOf | Section 5 | Current truth for sale period | Includes tax | Must not use header RETURNED alone for partial | Canonical restated ops sales |
| returns_incl_tax_activity | Incl | Allocated on return | Action period | Return merchandise value | Corrective activity | None | Whole-sale today | Not action-period Sales |
| sales_tax_restated | Tax components | With retained portions | Line allocations | Components only | Compliance | Ghana config | Missing components make UNAVAILABLE or INCOMPLETE | No invented tax |
| revenue_excl_tax_restated | Excl | After | Line allocations | Remaining lineSubtotal | Formal P&L | Needs lines | IS-like | Distinct from incl-tax metrics |
| paid_at_sale_value_incl_tax | Incl | None | None | saleCompletedAt settlement | Settlement mix at checkout | Needs completion fields | UNAVAILABLE UNTIL DEPENDENCY | Not end-of-day |
| credit_originated_sale_value_incl_tax | Incl | None | None | Residual at saleCompletedAt | Credit origination | Same | UNAVAILABLE UNTIL DEPENDENCY | Immutable after sale |

---

# 10. Expense, purchase, liability and outflow contract

| Event | Profitability effect | Payable effect | Cash effect | Inventory effect | Auth date | Period treatment | Drill-down | Current support |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OpEx incurred and paid same day | Incurred OpEx when incurredAt exists | Zero | Outflow | None | incurredAt and paidAt | Same day both | Expense and payment | incurredAt missing |
| OpEx incurred pay later | Incurred OpEx | Increases then clears | Outflow when paid | None | incurredAt; paidAt | Split | Expense | DEP-EXP-1 |
| Prior OpEx paid today | No re-hit incurred if using incurredAt | Clears | Outflow today | None | paidAt | Cash today | Payment | Paid path OK |
| Late recording without incurredAt | Use recorded metric with disclosure | Per status | Per payments | None | createdAt | Disclose recorded-date | Expense | No backdate field |
| Inventory purchase cash | Not OpEx | Zero | inventory_purchase_cash_outflows | Increases stock | Purchase or paidAt | BS and cash | Purchase | Supported |
| Inventory purchase credit | Not OpEx | Increases AP | Zero | Increases stock | Purchase date | AP and inventory | Purchase | Supported |
| Supplier paid later | Not OpEx | Clears AP | Outflow | None | paidAt | Cash and AP | PurchasePayment | Supported |
| Expense reversed | Reverse OpEx | Adjust | Maybe recovery | None | Reversal time | Dual | Reversal | UNAVAILABLE UNTIL DEPENDENCY |
| Drawer supplier payment | Not OpEx | Clears AP | Drawer outflow | None | Entry time | Drawer and AP | PAID_OUT_SUPPLIER | Confirmed |
| Unclassified cash out | Not OpEx | Unknown | unclassified_cash_outflows | None | Entry time | Control | Payment | Must classify |

---

# 11. Status inclusion matrix

| Entity or status | Economic meaning | Sales effect | Receipt effect | Stock effect | Balance effect | Expense or profit effect | Included metrics | Excluded metrics | Evidence or policy status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Invoice open PAID PART_PAID UNPAID | Active sale header | Restated amounts from lines after return allocations | Via payments | Sold qty minus returns | AR if unpaid after returns | GP on retained costed qty | Restated sales metrics | None solely by header | Confirmed statuses; restatement must use lines |
| Invoice RETURNED whole-sale | Fully returned header in current model | Zero retained restated amounts when all lines fully returned | Receipts kept | Restock or disposition | Clear sale AR | Reverse retained economics | returns activity | restated net when fully returned | Confirmed whole-sale |
| Invoice VOID | Voided | Void activity; zero restated | Receipts kept unless deleted | Void path | Clear | Reverse | voids activity | restated net | Confirmed |
| Partial returns without header RETURNED | Line allocations only | Reduce allocated portions only | Receipts kept | Partial | Reduce returned charge only | Partial reverse | returns activity plus restated reductions | Treating header RETURNED as partial calculator | Future dependency |
| Payment CONFIRMED | Valid in | None | money_received | None | AR decreases | None | money_received family | None | Confirmed |
| Payment FAILED CANCELLED | Invalid | None | Never confirmed | None | None | None | failed_payments_count | money_received | Confirmed |
| Payment null unknown | Unverified | None | unverified_legacy_receipts | None | None | None | unverified_legacy_receipts | money_received | Proposed |
| Ordinary refund | Customer repay | None | None | None | Maybe customer payable | None | refund_outflows | payment_reversal_outflows | Separated |
| Payment reversal | Settlement unwind | None | None | None | AR may increase | None | payment_reversal_outflows | refund_outflows | Dependency |
| Expense PAID UNPAID | Settlement | None | None | None | unpaid OpEx | recorded paid incurred split | opex metrics | None | Confirmed |
| Shift OPEN CLOSED | Till session | None | Drawer | None | expected declared | None | cash metrics | None | Confirmed |

---

# 12. Data-quality contract

Quality vocabulary: COMPLETE; INCOMPLETE; ESTIMATED analytical only; UNRECONCILED; UNVERIFIED; UNAVAILABLE; NOT_APPLICABLE; UNAVAILABLE_UNTIL_DEPENDENCY; STALE_UNAVAILABLE for failed current recompute after stale cache.

| Metric | Required inputs | Completeness test | Allowed quality states | Display rule | Required disclosure | Corrective route | Current capability | Dependency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| money_received | CONFIRMED status | Known allowed status | COMPLETE otherwise split unverified | Never promote unverified | Legacy count | Backfill status | Strong after parent-filter fix | DEP-PAY-1 DEP-PAY-2 |
| net_sales_incl_tax_restated | Sale lines plus return lines asOf | Return-line grain present for partials | COMPLETE or UNAVAILABLE_UNTIL_DEPENDENCY | No whole-invoice fake partial | Dependency id | Build return lines | Whole-sale only today | DEP-RET-1 |
| gross_profit_complete | 100 percent reliable costs on retained lines | coverage equals 100 | COMPLETE or UNAVAILABLE | No fake GP | Coverage percent | Cost capture repair | Partial detector | DEP-COST-1 |
| gross_profit_on_costed_sales | Costed retained lines | None beyond subset | INCOMPLETE as GP label | With coverage | On costed sales only | Same | Computable with caveats | Stop inferred |
| paid_at_sale_value_incl_tax | saleCompletedAt and settlement allocation | Fields present | UNAVAILABLE_UNTIL_DEPENDENCY until present | No end-of-day substitute | Dependency id | Add completion and allocation | No saleCompletedAt | DEP-SALE-1 |
| ar_current ar_overdue | Contractual dueDate | dueDate present | Unknown uses ar_due_date_unknown | Never bucket unknown into current or overdue | Unknown count | Capture dueDate | dueDate optional | Policy on due source |
| payment_reversal_outflows | Reversal rows | Rows exist | UNAVAILABLE_UNTIL_DEPENDENCY | No fabricate | DEP-PAY-3 | Reversal ledger | Missing | DEP-PAY-3 |
| operating_expenses_incurred | incurredAt | Present | UNAVAILABLE_UNTIL_DEPENDENCY | Use recorded interim with disclosure | Recorded-date | Add incurredAt | Missing | DEP-EXP-1 |

---

# 13. Traceability and reconciliation contract

Universal drill-down context fields: businessId; timezone; periodStart; periodEnd or asOf; branchScope; optional till shift user; metricId; definitionVersion; currency; taxMode; qualityState; filters; sort; sourceRevision; calculationRevision; generatedAt.

| Metric | Supporting grain | Reconciliation equation | Inherited scope | Net to gross explanation | Export rule | Permission dependency | Revision identity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| money_received | SalesPayment | Sum amount equals headline | Yes | Method splits and exclusions listed | Same filter and revisions | Role | definitionVersion and sourceRevision |
| refund_outflows | Refund money-out rows | Sum refund equals headline | Yes | Method | Same | Role | Same |
| payment_reversal_outflows | Reversal rows | Sum reversal equals headline | Yes | Link original payment | Same | Role | Gated until dependency |
| net_sales_incl_tax_restated | Sale lines plus return allocations | Sum retained line nets equals headline | Yes | Show original line and return allocations | Same | Role | Same |
| returns_incl_tax_activity | Return and return-line rows | Sum return merchandise value equals headline | Yes | Link originating sale line | Same | Role | Same |
| paid_at_sale_value_incl_tax | Sale plus checkout-settlement payments | Sum portions equals headline | Yes | Show cut-off and allocations | Same | Role | Gated |
| gross_profit_on_costed_sales | Retained costed lines | Sum subtotal minus cost equals headline | Yes | Costed versus missing partitions | Cost permission | Cost-sensitive | Same |
| gross_profit_complete | Retained lines | Only when coverage 100 | Yes | Same | Cost permission | Cost-sensitive | Same |
| ar_balance | Open invoices | Sum balances equals headline | asOf and branch | Due-status and overdue buckets | Role | Role | Same |
| cash_difference | Shift | Sum actual minus expected | Shift filters | Show both sides | Role | Role | Same |

Currently supported metrics are operationally traceable only where supporting records and compatible revision context exist. Dependency-gated metrics are not presently operationally traceable. Required future grain is defined above. Unsupported metrics must not be described as currently reconciled or auditable.

---

# 14. Corrections, restatements and snapshots

| Scenario | Event period | Action period | Live restated metrics | Event-activity metrics | Existing snapshot | New snapshot | Cache effect | Audit | User disclosure | Current dependency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Later partial return | Sale period membership unchanged | returnEffectiveAt | Reduce allocated line portions | returns_incl_tax_activity | Immutable | May differ | Invalidate on sourceRevision change | Required | Dual Metric IDs | DEP-RET-1 |
| Later full return | Same | returnEffectiveAt | Remove remaining recognised amounts | returns activity | Immutable | May differ | Invalidate | SALE_RETURN | Needed | Whole-sale OK |
| Later refund | None for sales | refundEffectiveAt | Settlement asOf may change | refund_outflows; money_received history kept | Immutable | May differ | Invalidate | Required | Separate from reversal | — |
| Payment reversal | None for sales | reversalEffectiveAt | Settlement asOf changes | payment_reversal_outflows; money_received history kept | Immutable | May differ | Invalidate | Required | Link original | DEP-PAY-3 |
| Cost repair | Sale period GP | None | Restate GP | None | Prior baseline immutable | New | Invalidate | PRICE_REPAIR | Compare to baseline | Confirmed repair path |
| Late expense | Target incurred period | recorded and paid activity | Needs incurredAt | recorded and paid metrics | Immutable delivered | New | Invalidate | Required | Recorded-date interim | DEP-EXP-1 |
| Old shift close | None | closedAt | Open clears; declared appears | None | Shift closure snapshot policy | New | Invalidate | Required | None special | Confirmed closedAt now |

Weekly Digest today is a live cached query, not an immutable delivered snapshot.

---

# 15. Aggregation contract

| Metric | Across time | Across branches | Across tills or users | Across currency | Additivity class | Recalculation rule |
| --- | --- | --- | --- | --- | --- | --- |
| money_received refund_outflows net_sales restated purchases opex paid recorded | Sum | Sum | Sum | Single currency only | ADDITIVE | None |
| payment_reversal_outflows | Sum | Sum | Sum | Single | ADDITIVE | When available |
| averages margins coverage | Recompute | Recompute | Recompute | None | RATIO | Never average averages |
| ar_balance ap_balance inventory customer_credit_payable due-status splits | Last asOf only | Sum positions | None | Single | POINT_IN_TIME | Never sum across days |
| transactions_restated units_sold_restated | Sum | Sum | Sum | None | ADDITIVE | From retained components |
| open_shifts low_stock risk pending_order_count | Recompute distinct | Union recompute | None | None | DISTINCT_COUNT | Dedupe |
| cash_difference | Sum closed in range | Sum | Sum | None | Conditional ADDITIVE | Prefer per-shift |
| cash_difference_abs | Sum absolute values | Sum | Sum | None | Control total | Not P and L net |
| fully_settled asOf metrics | At one asOf | Sum or count | None | None | POINT_IN_TIME settlement | Recompute at asOf |

---

# 16. Entitlement and access invariants

Fundamental truth must use the same Metric ID formulas on every plan for restated and before-returns sales metrics that are supported, money_received and method splits, transactions_restated when supported, ar_balance and ap_balance, drawer expected declared and difference, basic stock quantity, void and return activity, and refund_outflows.

Supporting evidence detail may be role-gated without changing formulas.

Paid tiers may add deeper analysis, forecasting, packaging intelligence, automation, delivery, advanced risk, and audit log.

Cost Gross Profit expenses and staff-level patterns require explicit access policy. Summary detail export and API must enforce compatible permissions. Aggregation must not unlock denied drill-downs.

Manager visibility of cost and Gross Profit remains a reserved product decision.

---

# 17. Data-model and workflow dependency register

| Dependency ID | Contract requirement | Current capability | Evidence | Exact gap | Smallest future change | Backfill needed | Metrics affected | Severity | Blocks architecture |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEP-PAY-1 | money_received ignores parent RETURNED VOID | Parent status still filtered in places | weekly-digest.ts payment invoice filter; today-kpis.ts liquid assets path | Parent filter | Shared query helper | No | money_received family | Critical | No |
| DEP-PAY-2 | Unknown status to unverified | Default CONFIRMED; null possible | SalesPayment.status | No UNVERIFIED path | Explicit enum handling | Yes | unverified_legacy_receipts | High | No |
| DEP-PAY-3 | Payment reversal lifecycle | Status flips or hard delete | owner-sale-cleanup deletes payments | No dated reversal row | Reversal ledger; stop hard delete | Yes if deleted | payment_reversal_outflows | High | Capability only |
| DEP-RET-1 | Partial return lines and quantities | Whole invoice only | SalesReturn.salesInvoiceId unique | No return lines | SalesReturnLine allocation fields | No | All restated trading and partial returns | High | Capability only |
| DEP-RET-2 | Damaged disposition | Always saleable restock | returns.ts restock loop | No disposition | Disposition enum and write-off movement | No | stock_damaged and GP | High | Capability only |
| DEP-RET-3 | Refund without stock return | Coupled restock | returns always restock | No skipStock | Optional flag | No | inventory versus refund | Medium | Capability only |
| DEP-SALE-1 | saleCompletedAt and checkout settlement allocation | SalesInvoice.createdAt only; payments lack settlement link | schema SalesInvoice; SalesPayment | No completion cut-off field or settlement id | Add saleCompletedAt and allocation relation | Optional | paid_at_sale credit_originated receipts_credit_collections | High | Those metrics only |
| DEP-COST-1 | Provenance and EXPLICIT_ZERO | lineCostPence default 0; defaultCost fallback | schema lineCostPence; financials.ts fallback | Ambiguous zero | costProvenance on line | Yes classify | GP metrics | Critical | Complete GP trust |
| DEP-EXP-1 | Expense incurred date | createdAt dueDate paidAt only | Expense model | No incurredAt | Add incurredAt | Optional | opex_incurred operating_result | High | Accrual OpEx only |
| DEP-DUE-1 | Contractual dueDate completeness | dueDate optional | SalesInvoice.dueDate | Many unknown due dates | Capture dueDate; reserved policy if another legal due rule required | Optional | ar_current overdue buckets | Medium | Due-status precision |
| DEP-CN-1 | Customer credit notes and payables | Limited | None general | No general payable ledger | Liability records | No | customer_credit_notes customer_credit_payable | Medium | Capability only |
| DEP-SNAP-1 | Immutable digest baseline | DayClosure exists; digest live | DayClosure model; weekly-digest cache | Digest not baseline | Persist delivery snapshots | Optional | RESTATED versus digest | High | Digest claim only |
| DEP-VER-1 | definitionVersion and sourceRevision on results | Not stamped on cache payloads | unstable_cache wrappers | Missing revision identity | Stamp on cache and export | No | All cached metrics | High | No |
| DEP-TZ-1 | Business TZ period bounds | Field exists; reports often local | timezone; date-parsing setHours | Not applied in reports | Shared clock helper | No | All period metrics | Critical | No |
| DEP-AR-1 | Full AR balance metric | CC uses 90-day created floor | today-kpis ninetyDaysAgo | Silent truncate if used as balance | Use ar_balance versus ar_monitoring_90d | No | ar family | High | No |

---

# 18. Contract-to-current-implementation conflict register

| ID | Metric or contract area | Current implementation | Conflict | User impact | Severity | Future remediation class | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| X1 | money_received | Parent RETURNED VOID excluded | Erases historical receipts | Wrong history after returns | Critical | DEP-PAY-1 | weekly-digest.ts; today-kpis liquid assets |
| X2 | money_received CC path | May omit payment status filter on today receipts | Failed can inflate | Inflated money | Critical | Shared helper | today-kpis receipt queries |
| X3 | Restated sales | Header RETURNED whole-sale | Cannot compute partial return | Wrong restated sales | High | DEP-RET-1 | SalesReturn unique; returns.ts |
| X4 | GP | defaultCost fallback; weekly grossMarginPence | Inferred and dual foundation | False GP | Critical | DEP-COST-1 | financials.ts; weekly-digest.ts |
| X5 | Clock | server-local setHours | Wrong business day | Mis-day KPIs | Critical | DEP-TZ-1 | date-parsing.ts |
| X6 | AR balance | 90-day created floor used as balance | Silent understatement | Miss old debt | High | Metric split | today-kpis |
| X7 | Ageing | Invoice age buckets mixed with overdue meaning | One-day overdue may look current | Wrong collections priority | High | Due status split Section 5.6 | operational-metrics.ts getReceivableAgeBucket |
| X8 | Paid-at-sale | No saleCompletedAt; prior draft used day end | Same-day late payment misclassified | Wrong credit analytics | High | DEP-SALE-1 | schema lacks saleCompletedAt |
| X9 | Reversals | Deletes or status collapse | History loss | Unreconcilable | High | DEP-PAY-3 | owner-sale-cleanup |
| X10 | Digest | Live one hour cache | Silent change | Trust | High | DEP-SNAP-1 | weekly-digest cache |
| X11 | Cache freshness | No sourceRevision stamp | Stale claim reconcile | False trust | High | DEP-VER-1 | cache wrappers |
| X12 | Damaged returns | Always saleable restock | Wrong stock and cost | Misleading inventory | High | DEP-RET-2 | returns.ts |

---

# 19. Final policy decision register

| ID | Decision | Final recommended rule | Alternatives rejected | Reasoning | Decision type | Confidence | Evidence or policy basis | Reserved | Blocks architecture |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | Historical receipts | Keep in money_received after return void refund | Parent exclusion | Economic truth | repository-derived and accounting | High | Settled rule | No | No |
| P2 | Restated trading grain | Sale-line and returned-quantity allocation | Header RETURNED as partial calculator | Partial returns | product and accounting | High | Correction 2 | Capability gated | No |
| P3 | Paid-at-sale cut-off | saleCompletedAt checkout finalisation | End of business day | Same-day late pay is collection | accounting | High | Correction 3 | DEP-SALE-1 | Those metrics only |
| P4 | Due versus age | Separate due status and overdue days buckets | Invoice age as overdue proxy | One-day overdue must be overdue | accounting | High | Correction 4 | DEP-DUE-1 optional | No |
| P5 | Unknown due dates | DUE_DATE_UNKNOWN only | Silent current or overdue | No invented due | data-quality | High | Correction 4 | No | No |
| P6 | Refund versus reversal | Separate Metric IDs | Synonyms | Different economics | accounting | High | Settled | No | No |
| P7 | Damaged return cost | Restate remove sales and COGS; Feb write-off equal to sale-time cost; no saleable restock | Reverse COGS and ignore loss | Cost must not disappear | accounting | High | Example D | Capability | No |
| P8 | Under-refund remainder | customer_credit_payable | Disappear remainder | Visibility | accounting | High | Example D | DEP-CN-1 | No |
| P9 | GP complete | Only 100 percent coverage | Estimate as GP | Trust | data-quality | High | Settled | No | No |
| P10 | Cache staleness | Detect revision mismatch; invalidate; recompute; else STALE_UNAVAILABLE | Rounding excuse; multiple optional outcomes | Determinism | product | High | Correction 5 and 8 | DEP-VER-1 | No |
| P11 | Manager cost access | Unresolved | Assume current equals future | Policy | unresolved | Low | Prior finding | Yes | Access only |
| P12 | Digest freeze timing | Live until persisted | Claim immutable now | Truth in code | product | High | weekly cache | Yes for immutability claim | No |
| P13 | definitionVersion | Required on results | None | Dual compliance prevention | product | High | Settled | No | No |

---

# 20. Worked examples

Business: Ama Provisions; currency GHS; timezone Africa/Accra; definitionVersion tf-rc/3R.4R; vatEnabled false unless stated so incl tax equals ex tax amounts.

## Example A — Partial pay with completion cut-off

Assumed fields for contract economics: saleCompletedAt 09:00; confirmed cash allocation in checkout 600 at 09:00; later MoMo 300 next week; 100 remains.

| When | net_sales_incl_tax_restated | paid_at_sale_value_incl_tax | credit_originated_sale_value_incl_tax | money_received | receipts_credit_collections | ar_balance |
| --- | --- | --- | --- | --- | --- | --- |
| Sale day after checkout | 1000 | 600 | 400 | 600 | 0 | 400 |
| Same day 23:50 later cash 50 if occurred | 1000 | 600 unchanged | 400 unchanged | 50 additional | 50 | 350 |
| Next week MoMo 300 | 0 sales | 600 unchanged | 400 unchanged | 300 | 300 | 100 |

Present execution of paid-at-sale and credit-originated remains UNAVAILABLE UNTIL DEPENDENCY RESOLVED until saleCompletedAt and settlement allocation exist. The table is the canonical future result.

## Example B — Prior-period credit collection

| Period | net_sales_incl_tax_restated | money_received | ar_balance |
| --- | --- | --- | --- |
| Last month credit sale 500 | 500 | 0 | 500 |
| This month collect 500 | 0 | 500 | 0 |

## Example C — Later refund

| Metric | January | February |
| --- | --- | --- |
| money_received | 200 | 0 |
| refund_outflows | 0 | 200 |
| payment_reversal_outflows | 0 | 0 |
| net_sales_incl_tax_restated for January membership after return | 0 | None |
| returns_incl_tax_activity | 0 | 200 |

## Example D — Partial damaged return numerical

January: two units; gross 120 each; discount 20 each; net 100 each; receipt 200; cost 60 each.

February: one unit returned; merchandise return value 100; cash refund 80; customer_credit_payable 20; damaged not saleable.

| View | Metric | Amount |
| --- | --- | --- |
| January original activity | net_sales_before_returns_incl_tax | 200 |
| January original activity | money_received | 200 |
| January original activity | cogs before later return | 120 |
| January original activity | gross_profit before later return | 80 |
| February activity | returns_incl_tax_activity | 100 |
| February activity | refund_outflows | 80 |
| February activity | customer_credit_payable | 20 |
| February activity | stock_customer_returns_saleable | 0 |
| February activity | stock_damaged_returns_qty | 1 |
| February activity | stock_damaged_returns_value | 60 |
| February activity | damaged write-off expense | 60 |
| February activity | payment_reversal_outflows | 0 |
| Current-restated January asOf after return | net_sales_incl_tax_restated | 100 |
| Current-restated January | units_sold_restated | 1 |
| Current-restated January | transactions_restated | 1 |
| Current-restated January | cogs_restated | 60 |
| Current-restated January | gross_profit_complete | 40 |
| Current-restated January | money_received January period | 200 |

Across-period money: receipt 200; refund 80; payable to customer 20; retained merchandise economics 100.

Present execution of this partial damaged path is UNAVAILABLE UNTIL DEPENDENCY RESOLVED for DEP-RET-1 and DEP-RET-2.

## Example E — Seventy percent cost coverage

Total net revenue excluding tax GHS 1,000; reliably costed revenue GHS 700; uncosted revenue GHS 300; reliable COGS on costed sales GHS 420.

| Metric ID | Result |
| --- | --- |
| cost_coverage_pct | 70% |
| gross_profit_complete | No canonical numerical value; quality INCOMPLETE |
| gross_profit_on_costed_sales | GHS 280 |
| Uncosted revenue partition | GHS 300 |
| Forbidden presentation | GHS 580 must not be labelled complete canonical Gross Profit |

## Example F — Supplier purchase then pay

| Event | OpEx | AP | Cash | Inventory value | COGS |
| --- | --- | --- | --- | --- | --- |
| Purchase 1000 on credit | 0 | 1000 | 0 | 1000 | 0 |
| Later pay 1000 | 0 | 0 | -1000 | 1000 | 0 |
| Later sell cost 600 | 0 | 0 | None | 400 | 600 |

## Example G — Late operating expense

| View | Last month | This month |
| --- | --- | --- |
| Target with incurredAt | operating_expenses_incurred 150 | operating_expenses_paid 150 |
| Interim without incurredAt | incurred UNAVAILABLE_UNTIL_DEPENDENCY | operating_expenses_recorded 150 and paid 150 with recorded-date disclosure |

## Example H — Shift spanning midnight

| Time Accra | Channel | Calendar money_received day | Shift drawer |
| --- | --- | --- | --- |
| 23:45 cash 50 | cash | Day D | Increases expected cash |
| 23:50 MoMo 40 | momo | Day D | No cash expected increase |
| 00:15 cash 30 | cash | Day D+1 | Same shift expected cash |
| Close 01:00 | None | None | Declared and difference on shift |

## Example I — Return without refund on unpaid credit sale

Completed credit sale 100; no confirmed receipt; AR 100; later full merchandise return 100; refund 0; disposition saleable restock for this scenario.

| Metric | Result |
| --- | --- |
| Original sale activity | Visible net sales before returns 100 |
| money_received | 0 |
| refund_outflows | 0 |
| returns_incl_tax_activity in return period | 100 |
| net_sales_incl_tax_restated originating period after return | 0 |
| ar_balance after return | 0 |
| inventory saleable | Plus 1 unit |

## Example J — Partially paid sale fully returned without cash refund

Sale GHS 100; confirmed payment GHS 40; AR before return GHS 60; full return GHS 100; cash refund GHS 0; saleable restock; sale-time cost GHS 60; later return period.

Equation: original charge 100 − return 100 − payment 40 + refund 0 = customer net position 40 owed by the business.

| Metric or balance | Result |
| --- | --- |
| Historical sale activity | GHS 100 in original activity period |
| Historical money_received | GHS 40 in original payment period |
| Restated originating net sales | Reduced by GHS 100 |
| returns_incl_tax_activity | GHS 100 in return period |
| refund_outflows | GHS 0 |
| ar_balance | GHS 0 |
| customer_credit_payable | GHS 40 |
| saleable inventory | +1 unit |
| COGS correction | GHS 60 |
| damaged_stock_writeoff_loss | GHS 0 |

Present customer_credit_payable execution is UNAVAILABLE UNTIL DEPENDENCY RESOLVED until DEP-CN-1 exists. The table is the canonical future result.

---

# 21. Conformance test specification

Every test has exactly one passing outcome. Gate tests are separate from post-dependency tests. No test selects its expected result by conditional support wording.

## 21.1 CT01 — Later refund after confirmed receipt

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT01 |
| Fixed precondition | Contract money_received and refund_outflows rules are active; payment reversal ledger is not required for this test. |
| Fixed dataset or state | January CONFIRMED receipt GHS 200; February intentional customer refund GHS 200; no payment-reversal row. |
| Action | Compute January and February money metrics. |
| Exact metric result or blocked state | January money_received = GHS 200; February refund_outflows = GHS 200; February payment_reversal_outflows = GHS 0. |
| Exact quality state | COMPLETE |
| Exact period treatment | Receipt remains in January receivedAt period; refund attributed to February refundEffectiveAt. |
| Exact drill-down result | Shows the January payment row and the February refund row as distinct events. |
| Exact reconciliation result | Headline January receipts and February refunds equal the sum of those drill-down rows. |
| Pass condition | PASS only when the stated metric amounts, COMPLETE quality, dual-period attribution, drill-down, and reconciliation all match; otherwise FAIL |

## 21.2 CT02G — Payment reversal capability gate

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT02G |
| Fixed precondition | No first-class payment-reversal ledger exists (DEP-PAY-3 unresolved). |
| Fixed dataset or state | Any CONFIRMED payment history without a dated reversal row type. |
| Action | Request payment_reversal_outflows for a period. |
| Exact metric result or blocked state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED; no canonical numerical payment_reversal_outflows value; dependency DEP-PAY-3 disclosed. |
| Exact quality state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact period treatment | No period attribution of a canonical reversal amount. |
| Exact drill-down result | Dependency notice for DEP-PAY-3 only; no fabricated reversal rows presented as complete. |
| Exact reconciliation result | No claim of complete reconciliation of payment_reversal_outflows. |
| Pass condition | PASS only when the metric is UNAVAILABLE UNTIL DEPENDENCY RESOLVED with DEP-PAY-3 disclosed and no canonical number; otherwise FAIL |

## 21.3 CT02 — Payment reversal post-dependency

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT02 |
| Fixed precondition | DEP-PAY-3 payment-reversal ledger is present. |
| Fixed dataset or state | CONFIRMED payment GHS 200 in period P1; dated payment-reversal row GHS 200 in period P2; no ordinary refund row. |
| Action | Compute money_received, refund_outflows, and payment_reversal_outflows. |
| Exact metric result or blocked state | P1 money_received remains GHS 200; P2 payment_reversal_outflows = GHS 200; P2 refund_outflows = GHS 0. |
| Exact quality state | COMPLETE |
| Exact period treatment | Original receipt stays in P1; reversal attributed to P2 reversalEffectiveAt. |
| Exact drill-down result | Links original payment id and reversal row. |
| Exact reconciliation result | Headline reversal equals the reversal drill-down sum. |
| Pass condition | PASS only when P1 receipt unchanged, P2 reversal GHS 200, refund_outflows GHS 0, COMPLETE; otherwise FAIL |

## 21.4 CT03 — Return without refund on unpaid credit sale

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT03 |
| Fixed precondition | Whole-sale return path available; unpaid credit sale. |
| Fixed dataset or state | Completed credit sale GHS 100; confirmed receipts GHS 0; AR GHS 100; later full merchandise return GHS 100; cash refund GHS 0; saleable restock. |
| Action | Post the return and compute metrics. |
| Exact metric result or blocked state | money_received = GHS 0; refund_outflows = GHS 0; returns_incl_tax_activity = GHS 100; net_sales_incl_tax_restated for originating period = GHS 0; ar_balance = GHS 0; saleable inventory +1; customer_credit_payable = GHS 0. |
| Exact quality state | COMPLETE for the whole-sale path |
| Exact period treatment | Sale activity remains in original period; return activity in returnEffectiveAt period; restated originating net becomes 0 as of after return. |
| Exact drill-down result | Originating sale, return event, inventory restoration; no refund row. |
| Exact reconciliation result | AR 0 and return activity 100 reconcile to sale and return rows; no money disappears. |
| Pass condition | PASS only when all stated metric amounts and COMPLETE whole-sale quality hold; otherwise FAIL |

## 21.5 CT04G — Refund without stock return gate

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT04G |
| Fixed precondition | Current model couples refund to restock; DEP-RET-3 unresolved. |
| Fixed dataset or state | No supported skipStock refund-without-return workflow. |
| Action | Request canonical refund-without-stock-return metric path. |
| Exact metric result or blocked state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED; dependency DEP-RET-3 disclosed; no fabricated zero stock movement presented as a supported skipStock path. |
| Exact quality state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact period treatment | No canonical skipStock period attribution. |
| Exact drill-down result | Dependency notice for DEP-RET-3. |
| Exact reconciliation result | No complete reconciliation claim for the unsupported path. |
| Pass condition | PASS only when UNAVAILABLE UNTIL DEPENDENCY RESOLVED with DEP-RET-3 and no fabricated skipStock result; otherwise FAIL |

## 21.6 CT04 — Refund without stock return post-dependency

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT04 |
| Fixed precondition | DEP-RET-3 skipStock refund path exists. |
| Fixed dataset or state | Authorised refund GHS 80 with skipStock true; no stock return movement. |
| Action | Post refund without stock return. |
| Exact metric result or blocked state | refund_outflows = GHS 80; stock_customer_returns_saleable = 0; restated sales unchanged by this refund alone. |
| Exact quality state | COMPLETE |
| Exact period treatment | Refund attributed to refundEffectiveAt action period; sales periods unchanged. |
| Exact drill-down result | Refund row without stock movement. |
| Exact reconciliation result | Refund headline equals refund drill-down; stock return metrics remain 0. |
| Pass condition | PASS only when refund GHS 80, stock return 0, restated sales unchanged, COMPLETE; otherwise FAIL |

## 21.7 CT05G — Partial quantity return gate

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT05G |
| Fixed precondition | SalesReturn.salesInvoiceId is unique whole-sale only; DEP-RET-1 unresolved. |
| Fixed dataset or state | Whole-sale-only return model. |
| Action | Request canonical partial-quantity restated allocation. |
| Exact metric result or blocked state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED; dependency DEP-RET-1 disclosed; no canonical numerical partial restated allocation. |
| Exact quality state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact period treatment | No canonical partial restatement attribution. |
| Exact drill-down result | Dependency notice for DEP-RET-1. |
| Exact reconciliation result | No complete partial-allocation reconciliation claim. |
| Pass condition | PASS only when UNAVAILABLE UNTIL DEPENDENCY RESOLVED with DEP-RET-1 and no canonical partial number; otherwise FAIL |

## 21.8 CT05 — Partial quantity return post-dependency

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT05 |
| Fixed precondition | DEP-RET-1 return-line allocation exists; vatEnabled false. |
| Fixed dataset or state | Example D records: January two units net 100 each; February one unit returned merchandise 100. |
| Action | Post partial return and compute restated and activity metrics. |
| Exact metric result or blocked state | February returns_incl_tax_activity = GHS 100; January net_sales_incl_tax_restated asOf after return = GHS 100; units_sold_restated = 1; transactions_restated = 1. |
| Exact quality state | COMPLETE |
| Exact period treatment | January membership restated asOf after return; February return activity period. |
| Exact drill-down result | Return lines linked to originating sale lines. |
| Exact reconciliation result | Restated and activity headlines equal drill-down allocations. |
| Pass condition | PASS only when Example D partial amounts match exactly with COMPLETE quality; otherwise FAIL |

## 21.9 CT06G — Damaged return gate

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT06G |
| Fixed precondition | Current returns always restock saleable; DEP-RET-2 unresolved. |
| Fixed dataset or state | No damaged disposition field on SalesReturn. |
| Action | Request stock_damaged_returns_qty and damaged_stock_writeoff_loss. |
| Exact metric result or blocked state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED; dependency DEP-RET-2 disclosed; no canonical damaged metrics. |
| Exact quality state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact period treatment | No canonical damaged-period attribution. |
| Exact drill-down result | Dependency notice for DEP-RET-2. |
| Exact reconciliation result | No complete damaged-return reconciliation claim. |
| Pass condition | PASS only when UNAVAILABLE UNTIL DEPENDENCY RESOLVED with DEP-RET-2 and no canonical damaged numbers; otherwise FAIL |

## 21.10 CT06 — Damaged return post-dependency

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT06 |
| Fixed precondition | DEP-RET-2 disposition and write-off path exist. |
| Fixed dataset or state | Example D damaged disposition: returned unit cost GHS 60; not saleable. |
| Action | Post damaged return. |
| Exact metric result or blocked state | stock_customer_returns_saleable = 0; stock_damaged_returns_qty = 1; damaged_stock_writeoff_loss = GHS 60 in February; restated January gross_profit_complete = GHS 40 when coverage complete. |
| Exact quality state | COMPLETE |
| Exact period treatment | Dual: February damaged activity; January restated GP asOf after return. |
| Exact drill-down result | Damaged movement and write-off linked to return line and sale-time cost. |
| Exact reconciliation result | Write-off GHS 60 equals immutable sale-time cost of damaged qty; saleable restock 0. |
| Pass condition | PASS only when saleable 0, damaged qty 1, write-off 60, restated January GP 40, COMPLETE; otherwise FAIL |

## 21.11 CT07 — Unknown payment status

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT07 |
| Fixed precondition | Payment status may be null or unknown. |
| Fixed dataset or state | Payment amount GHS 50 with null or unknown status. |
| Action | Compute money_received and unverified_legacy_receipts. |
| Exact metric result or blocked state | unverified_legacy_receipts = GHS 50; money_received excludes GHS 50. |
| Exact quality state | UNVERIFIED for the legacy receipt metric |
| Exact period treatment | Attributed by receivedAt of the unverified payment. |
| Exact drill-down result | Shows the unverified payment row. |
| Exact reconciliation result | Unverified headline equals unverified drill-down; money_received drill-down excludes it. |
| Pass condition | PASS only when unverified 50 included and money_received excludes 50; otherwise FAIL |

## 21.12 CT08G — Zero cost without authoritative provenance gate

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT08G |
| Fixed precondition | DEP-COST-1 provenance model required to distinguish EXPLICIT_ZERO from missing. |
| Fixed dataset or state | Completed sale; net sales excluding tax GHS 100; lineCostPence 0; no authoritative EXPLICIT_ZERO provenance. |
| Action | Evaluate cost coverage and complete Gross Profit treatment for the zero amount lacking provenance. |
| Exact metric result or blocked state | Zero is treated as MISSING for canonical coverage; not EXPLICIT_ZERO; gross_profit_complete has no canonical numerical complete Gross Profit from treating cost as genuine zero; missing-cost warning present. |
| Exact quality state | INCOMPLETE |
| Exact period treatment | Sale period of the invoice. |
| Exact drill-down result | Lists the line as missing cost provenance; does not display authoritative zero-cost provenance. |
| Exact reconciliation result | No claim that GHS 0 COGS is a proven genuine zero. |
| Pass condition | PASS only when zero without provenance is MISSING, quality INCOMPLETE, and no genuine-zero COMPLETE GP path is claimed; otherwise FAIL |

## 21.13 CT08 — Genuine zero cost with provenance

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT08 |
| Fixed precondition | DEP-COST-1 provenance is present and records EXPLICIT_ZERO. |
| Fixed dataset or state | Completed sale; net sales excluding tax GHS 100; immutable sale-time unit cost GHS 0; authoritative provenance confirming genuine zero acquisition or production cost; cost coverage 100%. |
| Action | Compute cogs_restated, gross_profit_complete, and cost_coverage_pct. |
| Exact metric result or blocked state | COGS GHS 0; complete Gross Profit GHS 100; cost coverage 100%; no missing-cost warning. |
| Exact quality state | COMPLETE |
| Exact period treatment | Sale period membership for the revenue and cost. |
| Exact drill-down result | Exposes the zero-cost provenance on the sale line. |
| Exact reconciliation result | GP 100 equals revenue 100 minus COGS 0; coverage numerator includes the EXPLICIT_ZERO line. |
| Pass condition | PASS only when COGS is GHS 0, complete Gross Profit is GHS 100, coverage is 100%, quality is COMPLETE, provenance is visible, and no missing-cost warning appears; otherwise FAIL |

## 21.14 CT09 — Missing cost

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT09 |
| Fixed precondition | Cost provenance rules active. |
| Fixed dataset or state | Sale line with MISSING cost (not EXPLICIT_ZERO). |
| Action | Compute coverage and COGS. |
| Exact metric result or blocked state | Line excluded from reliable COGS; cost not treated as zero; reduces cost_coverage_pct denominator treatment per missing rules. |
| Exact quality state | INCOMPLETE |
| Exact period treatment | Sale period. |
| Exact drill-down result | Lists the line as missing cost. |
| Exact reconciliation result | Missing line appears in uncosted partition; not in reliable COGS sum. |
| Pass condition | PASS only when missing cost is not zeroed into COGS and quality is INCOMPLETE; otherwise FAIL |

## 21.15 CT10G — Partial cost coverage current-capability gate

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT10G |
| Fixed precondition | Present TillFlow cannot produce canonical cost_coverage_pct with reliable provenance partitions (DEP-COST-1 unresolved for canonical coverage). |
| Fixed dataset or state | Mixed lines with some zero default costs and defaultCost fallbacks without provenance. |
| Action | Request canonical cost_coverage_pct and gross_profit_complete. |
| Exact metric result or blocked state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED for canonical cost_coverage_pct and gross_profit_complete; no GHS 580 figure labelled complete canonical Gross Profit; dependency DEP-COST-1 disclosed. |
| Exact quality state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact period treatment | No canonical complete GP period attribution. |
| Exact drill-down result | Dependency notice; non-canonical approximations must not be labelled canonical. |
| Exact reconciliation result | No complete canonical GP reconciliation claim. |
| Pass condition | PASS only when canonical coverage and complete GP are UNAVAILABLE UNTIL DEPENDENCY RESOLVED with DEP-COST-1 and no GHS 580 complete GP label; otherwise FAIL |

## 21.16 CT10 — Seventy-percent reliable cost coverage

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT10 |
| Fixed precondition | DEP-COST-1 reliable cost coverage computation is available. |
| Fixed dataset or state | Total net revenue excluding tax GHS 1,000; reliably costed revenue GHS 700; uncosted revenue GHS 300; reliable COGS on costed sales GHS 420. |
| Action | Compute cost_coverage_pct, gross_profit_complete, and gross_profit_on_costed_sales. |
| Exact metric result or blocked state | cost_coverage_pct = 70%; gross_profit_complete returns no canonical numerical value; gross_profit_on_costed_sales = GHS 280; uncosted revenue identified as GHS 300; GHS 580 is not presented as complete canonical Gross Profit. |
| Exact quality state | INCOMPLETE for gross_profit_complete; gross_profit_on_costed_sales must not be labelled complete Gross Profit |
| Exact period treatment | Sale period of the revenue population. |
| Exact drill-down result | Identifies exactly GHS 300 of uncosted revenue and the GHS 700 costed partition. |
| Exact reconciliation result | 280 equals 700 minus 420; coverage equals 700/1000; complete GP absent. |
| Pass condition | PASS only when coverage is 70%, complete GP has no canonical number with INCOMPLETE quality, on-costed GP is GHS 280, uncosted revenue is GHS 300, and GHS 580 is not labelled complete canonical Gross Profit; otherwise FAIL |

## 21.17 CT11G — Paid-at-sale capability gate

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT11G |
| Fixed precondition | No saleCompletedAt settlement link; DEP-SALE-1 unresolved. |
| Fixed dataset or state | Sales and payments without checkout settlement identity. |
| Action | Request paid_at_sale_value_incl_tax and credit_originated_sale_value_incl_tax. |
| Exact metric result or blocked state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED for both Metric IDs; dependency DEP-SALE-1 disclosed; no end-of-business-day numeric substitute labelled as paid-at-sale. |
| Exact quality state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact period treatment | No canonical paid-at-sale period attribution. |
| Exact drill-down result | Dependency notice for DEP-SALE-1. |
| Exact reconciliation result | No complete paid-at-sale reconciliation claim. |
| Pass condition | PASS only when both metrics UNAVAILABLE UNTIL DEPENDENCY RESOLVED with DEP-SALE-1 and no end-of-day substitute; otherwise FAIL |

## 21.18 CT11 — Paid-at-sale post-dependency

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT11 |
| Fixed precondition | DEP-SALE-1 saleCompletedAt and settlement allocation exist. |
| Fixed dataset or state | Example A: saleCompletedAt 09:00; checkout confirmed 600; later same-day 23:50 payment 50; next-week MoMo 300. |
| Action | Compute paid-at-sale and credit-originated values. |
| Exact metric result or blocked state | paid_at_sale_value_incl_tax = GHS 600; credit_originated_sale_value_incl_tax = GHS 400; same-day 23:50 payment is receipts_credit_collections not paid-at-sale; next-week payment does not change paid-at-sale or credit-originated. |
| Exact quality state | COMPLETE |
| Exact period treatment | Sale membership by sale period; settlement cut-off at saleCompletedAt. |
| Exact drill-down result | Sale settlement link and payment allocations with timestamps. |
| Exact reconciliation result | 600 + 400 equals sale total 1000; later collections excluded from paid-at-sale. |
| Pass condition | PASS only when paid-at-sale 600, credit-originated 400, later same-day and next-week payments are collections only; otherwise FAIL |

## 21.19 CT12 — Recorded recognised expense

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT12 |
| Fixed precondition | Expense.createdAt recording path available. |
| Fixed dataset or state | One recorded recognised expense amount GHS 150; recognition date = Expense.createdAt on 2026-08-01; payment state UNPAID at recognition. |
| Action | Compute operating_expenses_recorded for the recognition period. |
| Exact metric result or blocked state | operating_expenses_recorded = GHS 150 for 2026-08-01 recognition date; payment state UNPAID; this test does not assert incurred or paid metrics. |
| Exact quality state | COMPLETE |
| Exact period treatment | Attributed to Expense.createdAt recognition date. |
| Exact drill-down result | Expense row with amount, createdAt, and paymentStatus UNPAID. |
| Exact reconciliation result | Recorded headline equals the single expense row. |
| Pass condition | PASS only when recorded expense is GHS 150 on the stated recognition date with UNPAID state and COMPLETE quality; otherwise FAIL |

## 21.20 CT12P — Expense-payment outflow

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT12P |
| Fixed precondition | ExpensePayment.paidAt path available. |
| Fixed dataset or state | ExpensePayment of GHS 150 with paidAt in period P; linked to a recorded expense. |
| Action | Compute operating_expenses_paid for period P. |
| Exact metric result or blocked state | operating_expenses_paid = GHS 150 in period P. |
| Exact quality state | COMPLETE |
| Exact period treatment | Attributed to paidAt period P. |
| Exact drill-down result | ExpensePayment row linked to expense id. |
| Exact reconciliation result | Paid headline equals payment drill-down sum. |
| Pass condition | PASS only when operating_expenses_paid is GHS 150 in period P with COMPLETE quality; otherwise FAIL |

## 21.21 CT12G — Incurred-but-unrecorded expense gate

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT12G |
| Fixed precondition | No Expense.incurredAt or accrual liability source; DEP-EXP-1 unresolved. |
| Fixed dataset or state | An economic cost incurred in period I with no recorded Expense row and no accrual liability row. |
| Action | Request operating_expenses_incurred for period I. |
| Exact metric result or blocked state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED; no canonical incurred-expense number; dependency DEP-EXP-1 (Expense.incurredAt or accrual liability source) disclosed. |
| Exact quality state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact period treatment | No canonical incurred-period attribution. |
| Exact drill-down result | Dependency notice for DEP-EXP-1. |
| Exact reconciliation result | No complete incurred-expense reconciliation claim. |
| Pass condition | PASS only when operating_expenses_incurred is UNAVAILABLE UNTIL DEPENDENCY RESOLVED with DEP-EXP-1 and no canonical number; otherwise FAIL |

## 21.22 CT13 — Supplier purchase then pay

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT13 |
| Fixed precondition | Purchase and supplier payment models available. |
| Fixed dataset or state | Example F: purchase 1000 on credit then pay 1000 then sell cost 600. |
| Action | Compute OpEx, AP, cash, inventory value, and COGS across events. |
| Exact metric result or blocked state | On purchase: OpEx 0, AP 1000, cash 0, inventory value +1000, COGS 0. On pay: OpEx 0, AP 0, cash -1000. On sell cost 600: COGS 600, inventory value reduced accordingly. |
| Exact quality state | COMPLETE |
| Exact period treatment | Each event in its authoritative timestamp period. |
| Exact drill-down result | Purchase invoice, supplier payment, and sale cost rows. |
| Exact reconciliation result | AP and cash movements reconcile to purchase and payment rows; COGS only on sale. |
| Pass condition | PASS only when Example F amounts match with purchases distinct from OpEx and COGS; otherwise FAIL |

## 21.23 CT14 — Headline and detail same revision

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT14 |
| Fixed precondition | Cache revision stamping rules active for the surface under test. |
| Fixed dataset or state | Headline and detail share identical sourceRevision, definitionVersion, and scope. |
| Action | Reconcile headline to detail. |
| Exact metric result or blocked state | Exact integer reconcile between headline and detail. |
| Exact quality state | COMPLETE |
| Exact period treatment | Shared period or asOf. |
| Exact drill-down result | Detail rows under the same revision. |
| Exact reconciliation result | Headline equals sum of detail rows. |
| Pass condition | PASS only when exact integer reconcile succeeds with COMPLETE quality; otherwise FAIL |

## 21.24 CT15 — Detail revision newer than headline

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT15 |
| Fixed precondition | Revision identity available. |
| Fixed dataset or state | Headline sourceRevision R1; detail sourceRevision R2. |
| Action | Attempt reconcile. |
| Exact metric result or blocked state | Incompatibility detected; headline invalidated; no successful reconcile claim. |
| Exact quality state | Invalidated pending recompute |
| Exact period treatment | None claimed for a reconciled current headline. |
| Exact drill-down result | No reconciled detail set for the stale headline. |
| Exact reconciliation result | Reconcile refused due to revision mismatch. |
| Pass condition | PASS only when revision mismatch is detected and headline is invalidated; otherwise FAIL |

## 21.25 CT16 — Recompute after stale succeeds

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT16 |
| Fixed precondition | Follows CT15 invalidation; recompute succeeds. |
| Fixed dataset or state | Detail at R2; recompute produces headline at R2. |
| Action | Recompute headline. |
| Exact metric result or blocked state | Present recomputed headline with revision R2 reconciled to detail. |
| Exact quality state | COMPLETE |
| Exact period treatment | Shared period or asOf after recompute. |
| Exact drill-down result | Detail at R2. |
| Exact reconciliation result | Headline R2 equals detail R2 sum. |
| Pass condition | PASS only when recomputed headline R2 reconciles to detail R2; otherwise FAIL |

## 21.26 CT17 — Recompute after stale fails

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT17 |
| Fixed precondition | Follows CT15 invalidation; recompute fails. |
| Fixed dataset or state | Detail at R2; recompute failure. |
| Action | Attempt recompute. |
| Exact metric result or blocked state | No current canonical figure; state STALE_UNAVAILABLE. |
| Exact quality state | STALE_UNAVAILABLE |
| Exact period treatment | No current canonical period figure. |
| Exact drill-down result | Failure notice only. |
| Exact reconciliation result | No reconcile claim. |
| Pass condition | PASS only when state is STALE_UNAVAILABLE with no canonical figure; otherwise FAIL |

## 21.27 CT18 — Same revision one-penny allocation residual

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT18 |
| Fixed precondition | Allocation engine with deterministic residual rule. |
| Fixed dataset or state | Same revision; documented one-penny residual only. |
| Action | Allocate and reconcile. |
| Exact metric result or blocked state | Residual assigned deterministically; reconcile including residual line. |
| Exact quality state | COMPLETE |
| Exact period treatment | Shared scope. |
| Exact drill-down result | Includes residual line. |
| Exact reconciliation result | Headline equals detail plus residual line. |
| Pass condition | PASS only when deterministic residual is included and reconcile succeeds; otherwise FAIL |

## 21.28 CT19 — Different branch or period scope

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT19 |
| Fixed precondition | Scope chrome enforced. |
| Fixed dataset or state | Headline and detail have mismatched branch or period context. |
| Action | Attempt reconcile. |
| Exact metric result or blocked state | Must not claim reconcile; scope mismatch failure. |
| Exact quality state | Scope mismatch failure |
| Exact period treatment | Mismatched; no shared claim. |
| Exact drill-down result | Context chrome shows mismatch. |
| Exact reconciliation result | Reconcile refused. |
| Pass condition | PASS only when scope mismatch prevents reconcile claim; otherwise FAIL |

## 21.29 CT20 — definitionVersion change

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT20 |
| Fixed precondition | definitionVersion stamped on cache. |
| Fixed dataset or state | Old cache under prior definitionVersion; new contract version active. |
| Action | Read old cache under new contract. |
| Exact metric result or blocked state | Old cache invalid for new definitionVersion. |
| Exact quality state | Invalidated |
| Exact period treatment | None for invalid cache. |
| Exact drill-down result | None from invalid cache. |
| Exact reconciliation result | No reconcile using invalid cache. |
| Pass condition | PASS only when old cache is invalid under the new definitionVersion; otherwise FAIL |

## 21.30 CT21 — Immutable snapshot after live change

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT21 |
| Fixed precondition | Immutable snapshot identity exists for the delivered artefact. |
| Fixed dataset or state | Frozen export snapshot; later live return posts. |
| Action | Compare snapshot_value to live restated metrics. |
| Exact metric result or blocked state | snapshot_value unchanged; live restated metrics change; snapshot_identity remains the original baseline id. |
| Exact quality state | Snapshot immutable; live COMPLETE for live path |
| Exact period treatment | Dual identities: snapshot baseline versus live asOf. |
| Exact drill-down result | Snapshot baseline id distinct from live drill-down. |
| Exact reconciliation result | Snapshot reconciles to its frozen detail; live reconciles separately. |
| Pass condition | PASS only when snapshot unchanged while live restated metrics change; otherwise FAIL |

## 21.31 CT22 — Due status one-day overdue

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT22 |
| Fixed precondition | Contractual dueDate present. |
| Fixed dataset or state | Invoice dueDate = yesterday; asOf = today; open balance GHS 100. |
| Action | Classify AR due status and ageing. |
| Exact metric result or blocked state | ar_overdue = GHS 100; ar_current = GHS 0; ar_overdue_1_30 = GHS 100. |
| Exact quality state | COMPLETE |
| Exact period treatment | Point-in-time asOf. |
| Exact drill-down result | Invoice with dueDate and balance. |
| Exact reconciliation result | Overdue amount equals the invoice balance and the 1-30 bucket. |
| Pass condition | PASS only when overdue 100, current 0, bucket 1-30 = 100; otherwise FAIL |

## 21.32 CT23 — Unknown due date

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT23 |
| Fixed precondition | dueDate optional. |
| Fixed dataset or state | Invoice dueDate null; balance GHS 100. |
| Action | Classify AR due status. |
| Exact metric result or blocked state | ar_due_date_unknown = GHS 100; amount not in ar_current, ar_due_today, or ar_overdue. |
| Exact quality state | COMPLETE |
| Exact period treatment | Point-in-time asOf. |
| Exact drill-down result | Invoice showing missing dueDate. |
| Exact reconciliation result | Unknown bucket holds 100; other due-status buckets exclude it. |
| Pass condition | PASS only when unknown 100 and excluded from current, due-today, and overdue; otherwise FAIL |

## 21.33 CT24 — AR total reconciliation

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT24 |
| Fixed precondition | Mixed due statuses present. |
| Fixed dataset or state | Open AR spanning CURRENT, DUE_TODAY, OVERDUE buckets, and DUE_DATE_UNKNOWN. |
| Action | Reconcile AR family metrics. |
| Exact metric result or blocked state | ar_balance equals ar_current + ar_due_today + ar_overdue + ar_due_date_unknown; ar_overdue equals sum of ar_overdue_1_30 + ar_overdue_31_60 + ar_overdue_61_90 + ar_overdue_91_plus. |
| Exact quality state | COMPLETE |
| Exact period treatment | Point-in-time asOf. |
| Exact drill-down result | Invoices partitioned by due status and overdue bucket. |
| Exact reconciliation result | Both identities hold exactly. |
| Pass condition | PASS only when both AR reconciliation identities hold exactly; otherwise FAIL |

## 21.34 CT25G — Partially paid full return customer-obligation gate

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT25G |
| Fixed precondition | No authorised customer-credit/payable ledger; DEP-CN-1 unresolved. |
| Fixed dataset or state | Sale 100; paid 40; AR 60; full return; refund 0; model lacks customer_credit_payable ledger. |
| Action | Request canonical customer_credit_payable after return. |
| Exact metric result or blocked state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED for customer_credit_payable; no canonical customer-credit/payable number; dependency DEP-CN-1 disclosed; do not silently drop the GHS 40 obligation. |
| Exact quality state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact period treatment | No canonical payable period amount. |
| Exact drill-down result | Dependency notice for DEP-CN-1; must not present AR-only clearance as complete customer-obligation truth. |
| Exact reconciliation result | No complete customer-obligation reconciliation claim. |
| Pass condition | PASS only when customer_credit_payable is UNAVAILABLE UNTIL DEPENDENCY RESOLVED with DEP-CN-1 and no canonical payable number; otherwise FAIL |

## 21.35 CT25 — Partially paid sale fully returned without cash refund

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT25 |
| Fixed precondition | DEP-CN-1 customer-credit/payable ledger available; whole-sale return with saleable restock; reliable immutable sale-time cost GHS 60. |
| Fixed dataset or state | Completed sale GHS 100; confirmed payment before return GHS 40; receivable immediately before return GHS 60; full valid merchandise return GHS 100; cash refund at return GHS 0; customer credit/payable created GHS 40; return in a later action period; returned item restored to saleable inventory; sale-time cost GHS 60. |
| Action | Post the full return with zero cash refund and compute metrics. |
| Exact metric result or blocked state | Historical sale activity remains GHS 100 in original activity period; historical Money Received remains GHS 40 in original payment period; current-restated originating-period net sales reduce by GHS 100; current receivable GHS 0; customer credit/payable GHS 40; refund outflow GHS 0; later-period return activity GHS 100; saleable inventory +1; COGS corrected by GHS 60; damaged-stock loss GHS 0; economic equation: original charge 100 minus return 100 minus payment 40 plus refund 0 equals customer net position GHS 40 owed by the business; ledger presentation receivable 0 and customer credit/payable 40; GHS 40 payment is not reclassified as a refund; no money disappears. |
| Exact quality state | COMPLETE |
| Exact period treatment | Dual: original sale and payment periods preserved; return activity in later returnEffectiveAt period; restated originating net asOf after return. |
| Exact drill-down result | Links sale, sale line, payment allocation, return line, inventory restoration, and customer obligation. |
| Exact reconciliation result | Receivable 0 + customer_credit_payable 40 + refund_outflows 0 + historical money_received 40 reconcile to the stated equation without reclassifying the payment as a refund. |
| Pass condition | PASS only when all stated CT25 amounts hold, including receivable GHS 0, customer credit/payable GHS 40, refund outflow GHS 0, COGS correction GHS 60, and COMPLETE quality; otherwise FAIL |

## 21.36 CT26G — Customer-obligation ledger gate

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT26G |
| Fixed precondition | Customer-credit/payable ledger absent; DEP-CN-1 unresolved. |
| Fixed dataset or state | Any return or under-refund scenario requiring customer_credit_payable. |
| Action | Request customer_credit_payable. |
| Exact metric result or blocked state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED; no canonical customer-credit/payable number; dependency DEP-CN-1 disclosed. |
| Exact quality state | UNAVAILABLE UNTIL DEPENDENCY RESOLVED |
| Exact period treatment | No canonical payable attribution. |
| Exact drill-down result | Dependency notice for DEP-CN-1. |
| Exact reconciliation result | No complete customer-obligation reconciliation claim. |
| Pass condition | PASS only when customer_credit_payable is UNAVAILABLE UNTIL DEPENDENCY RESOLVED with no canonical number; otherwise FAIL |

## 21.37 CT26P — Customer-obligation ledger post-dependency

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT26P |
| Fixed precondition | DEP-CN-1 customer-credit/payable ledger present. |
| Fixed dataset or state | Completed sale GHS 100; customer payment GHS 100; full return GHS 100; cash refund GHS 0; resulting customer credit/payable GHS 100; receivable effect to GHS 0. |
| Action | Post return with zero cash refund against a fully paid sale. |
| Exact metric result or blocked state | Historical money_received GHS 100 unchanged in original payment period; refund_outflows GHS 0; customer_credit_payable GHS 100; receivable GHS 0; restated originating net sales GHS 0. |
| Exact quality state | COMPLETE |
| Exact period treatment | Dual: historical receipt period preserved; payable and return effects asOf after return. |
| Exact drill-down result | Links sale, payment, return, and customer_credit_payable row. |
| Exact reconciliation result | Payable 100 equals payment 100 minus refund 0 after full return; receivable 0. |
| Pass condition | PASS only when payable GHS 100, receivable GHS 0, refund GHS 0, historical money_received GHS 100, COMPLETE; otherwise FAIL |

## 21.38 CT27 — Timezone midnight Accra

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT27 |
| Fixed precondition | Business.timezone Africa/Accra. |
| Fixed dataset or state | Sale at 00:30 Africa/Accra on calendar day D+1. |
| Action | Classify sale into business-local day. |
| Exact metric result or blocked state | Sale classified in local day D+1, not prior local day D. |
| Exact quality state | COMPLETE |
| Exact period treatment | Business-local day D+1. |
| Exact drill-down result | Shows timezone chrome and sale timestamp. |
| Exact reconciliation result | Period membership matches Africa/Accra civil day of the timestamp. |
| Pass condition | PASS only when sale at 00:30 Accra is in local day D+1; otherwise FAIL |

## 21.39 CT28 — Deny cost permission

| Test field | Contract requirement |
| --- | --- |
| Test ID | CT28 |
| Fixed precondition | Role lacks cost or Gross Profit permission. |
| Fixed dataset or state | Authenticated user without cost entitlement. |
| Action | Request GP detail and export. |
| Exact metric result or blocked state | GP detail and export denied; metric meaning unchanged for authorised roles. |
| Exact quality state | Permission failure |
| Exact period treatment | None for denied payload. |
| Exact drill-down result | Blocked; no unauthorised cost rows. |
| Exact reconciliation result | No reconcile of denied GP detail. |
| Pass condition | PASS only when GP detail and export are denied without changing metric meaning; otherwise FAIL |

# 22. Residual blocking gaps

| Gap ID | Exact unanswered question | Affected metrics | Why it matters | Evidence needed | Blocks architecture |
| --- | --- | --- | --- | --- | --- |
| GAP-COST-1 | How is EXPLICIT_ZERO provenance authored and audited on sale lines? | cost_coverage_pct; cogs_restated; gross_profit_complete | Zero versus missing cost changes complete GP trust | Product and accounting decision on provenance workflow | No for architecture; Yes for complete GP trust |
| GAP-CN-1 | What ledger grain authorises customer_credit_payable? | customer_credit_payable; CT25; CT26P | Under-refund and paid-then-returned sales otherwise lose visible obligations | Schema and workflow for customer liability | Capability only |
| GAP-SALE-1 | What field is the authoritative saleCompletedAt and checkout settlement link? | paid_at_sale_value_incl_tax; credit_originated_sale_value_incl_tax; receipts_credit_collections | Without it paid-at-sale cannot be computed | Checkout finalisation event design | Those metrics only |
| GAP-POLICY-1 | Manager Gross Profit access, tax label preference, digest freeze, overdue-shift hours, unusual-refund threshold, dueDate legal source? | Entitlement surfaces; digest snapshot claims; overdue_shifts; unusual_refunds_count; AR due-status precision | Reserved decisions gate packaging not metric meaning | Named product and accounting decisions | No for core contract meaning |

# 23. Final readiness verdict

Next bounded task: Product architecture and capability allocation based on the accepted Universal Reporting Contract.

CONTRACT REPAIRED WITH RESERVED DECISIONS — proceed while preserving named policy gates.
