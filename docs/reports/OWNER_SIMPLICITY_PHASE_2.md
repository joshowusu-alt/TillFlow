# Owner report simplicity — phase 2 backlog

Source review of current master, 28 November 2026. This is a prioritisation by expected owner workflow frequency (daily cash and sales checks, weekly stock control, then month-end and exceptions), **not measured customer telemetry**. A narrow table/overflow wrapper is a mobile risk, not proof it reproduces on every phone. No other page is changed by phase 1.

| Priority | Page | Expected cadence | What to check or simplify |
|---|---|---|---|
| 1 | Money received (/reports/money-received) | Daily | Keep confirmed receipts distinct from sales; check filters and exact payment values at phone widths. |
| 2 | Trading (/reports/dashboard) | Daily | Make receipts, refunds, customer debt, supplier debt and profit immediately distinguishable; preserve recently verified layout. |
| 3 | Cash drawer (/reports/cash-drawer) | Daily | “Shift ledger”, variance and dense desktop table; check expected/count/difference prominence and mobile parity. |
| 4 | MoMo to confirm (/reports/momo-confirmation) and MoMo with the network (/payments/reconciliation) | Daily for MoMo businesses | Separate waiting for provider from confirmed money; inspect long reference/status rows, drawers and actions. |
| 5 | Customer balances (/payments/customer-receipts) | Daily/weekly for credit sellers | Keep amount owed, overdue, customer credit and record-payment action separate; avoid ageing and receivables jargon in primary copy. |
| 6 | Supplier balances (/payments/supplier-aging) | Daily/weekly | Explain amounts owed, overdue and missing due dates; compact buckets and payment links. |
| 7 | Sales analytics (/reports/analytics) | Weekly | Classification performance tables, comparison and margin vocabulary; ensure exact figures and filters fit. |
| 8 | Stock to reorder (/reports/reorder-suggestions) | Weekly | Long reorder table and priority/status; lead with product, stock left and suggested quantity. Use branch consistently. |
| 9 | Product margins (/reports/margins) | Weekly | Margin %, target %, avg cost, below-cost wording and wide nine-column table; lead with profit per product, retain exact metrics. |
| 10 | Stock movements (/reports/stock-movements) | Weekly/exception | Dense movement history; show product, change, before/after and reason without horizontal scrolling. |
| 11 | Expiring stock (/reports/expiring) | Weekly for food/retail | Already has compact groupings; verify dates, quantities and long product names at phone width. |
| 12 | Income statement (/reports/income-statement) and supporting entries | Monthly | Recently compacted; preserve figures and verify remaining accounting terms in detail view and long entry rows. |
| 13 | Business movement (/reports/business-movement) | Monthly | Recently compacted; regression review only, particularly longer product names and comparison/disclosure wording. |
| 14 | Cash flow (/reports/cashflow) | Monthly | Explain profit-to-cash differences, opening entries and reconciliation notes in plain English. |
| 15 | Balance sheet (/reports/balance-sheet) and supporting entries | Monthly | Recently compacted; translate assets/liabilities/equity and reconciliation notes in supporting entries without changing statement totals. |
| 16 | Owner brief (/reports/owner) | Weekly/monthly, Pro | Review owner KPI, exception and trend copy; ensure no needless duplicate metrics. |
| 17 | Online storefront analytics (/settings/online-store/analytics) | Weekly, online businesses only | Explain visits, orders and conversion; check mobile charts and long product names. |
| 18 | Receipt transactions (/reports/receipts) | Exception | Detailed individual payments, wide transaction table; keep distinct from Money received. |
| 19 | Control alerts (/reports/risk-monitor) | Exception | “Anti-fraud”, overrides, variance and margin terminology; prioritise what to check, not accusations. Wide table risk. |
| 20 | Audit log (/reports/audit-log) | Exception, Pro | Wide seven-column event table, truncated details and raw entity/actions; show who, what, when before technical detail. |
| 21 | Downloads (/reports/exports) | Occasional | “Exports” vs Downloads and long file descriptions; keep export formats/scopes intact. |
| 22 | Command center (/reports/command-center) | Legacy/owner exceptions | Debt, overdue receivables, payables, cash variance and reconciliation vocabulary. Check whether owners still need this legacy surface before changing it. |
| 23 | Reports index (/reports) | Daily entry point | Directory and Today are already owner-oriented; only align labels with destination pages and verify compact mobile layout. |

Other inventory: /reports/sales is a gated redirect to Trading, not a separate screen. /reports/cashflow-forecast is withheld and /reports/weekly-digest is not linked in the owner directory; do not expose or modify either as part of this programme. Supplier sales is phase 1, including its product drill-down. All routes should retain entitlements, tenant/branch scope, export semantics and financial calculations.
