# TillFlow Plan Tiering Strategy

This document recommends the best market-fit approach for three connected decisions:

1. how TillFlow should store commercial plan status
2. what Starter, Growth, and Pro should unlock across the app
3. how upgrades, downgrades, and locked-feature experiences should work in practice

The recommendations below are based on the current product surfaces in the app, not a generic SaaS template.

## 1. Commercial Principles

TillFlow is not selling a lightweight POS toy. It is selling stable shop-floor operations first, then tighter owner control and visibility.

For the market TillFlow is targeting, the strongest principles are:

- core selling, stock control, offline resilience, and shift trust must never feel crippled
- paid tiers should charge for control depth, financial visibility, and executive oversight
- plan changes should be centrally managed, not editable by stores from normal Settings
- recovery and backup tooling should remain owner/admin operational tools, not commercial upsell bait
- Growth should be the default serious-business plan

## 2. Best Approach for Step 1: Store the Plan Properly

### Recommendation

Add a real persisted `plan` field on `Business` and stop treating legacy `mode` as the commercial source of truth.

### Why this works best

- It prevents stores from changing commercial access by flipping a normal settings control.
- It fits relationship-led sales and assisted onboarding better than self-serve billing-first logic.
- It supports manual upgrades, invoice-based upgrades, bank-transfer upgrades, and MoMo-assisted upgrades without forcing a card-only billing model.

### Recommended `Business` fields

- `plan`: `STARTER | GROWTH | PRO`
- `planStatus`: `TRIAL | ACTIVE | PAST_DUE | SUSPENDED`
- `trialEndsAt`: nullable datetime
- `planSetAt`: datetime
- `planChangedByUserId`: nullable string
- `billingNotes`: nullable string
- `legacyMode`: optional temporary compatibility field during migration only

### Recommended rollout

Phase 1:
- keep deriving plan from legacy fields for compatibility
- stop exposing Simple / Advanced as the user-facing product model

Phase 2:
- add real `plan` field in the database
- backfill current businesses from the legacy mapping
- make all gating read from `plan`

Phase 3:
- retire `mode` as commercial logic

### Legacy bridge to use during migration

- `SIMPLE -> STARTER`
- `ADVANCED + SINGLE_STORE -> GROWTH`
- `ADVANCED + MULTI_STORE -> PRO`

This is acceptable as a bridge, but it should not be the final model.

## 3. Best Approach for Step 2: What Each Plan Should Include

The right commercial structure is business-maturity based.

### Starter

Best for:
- single-store provision shops
- mini marts
- lean owner-led supermarkets
- stores that need operational confidence before they need heavy financial analysis

Should promise:
- run the shop properly every day
- sell confidently even with unstable internet
- close shifts and track stock without confusion

### Growth

Best for:
- serious supermarkets
- businesses that now care about gross margin discipline
- stores moving from survival reporting to real management reporting

Should promise:
- stronger control
- stronger margin visibility
- better financial reporting
- better decision-making

Growth should be the recommended plan for most serious businesses.

### Pro

Best for:
- multi-branch operators
- owners who want central oversight across branches or teams
- businesses needing auditability, cash forecasting, and executive control surfaces

Should promise:
- executive oversight
- stronger governance
- multi-branch command capability

## 4. Recommended App-Wide Entitlement Matrix

### Sell

| Surface | Route | Recommended Plan | Why |
|---|---|---:|---|
| POS | `/pos` | Starter | Core revenue capture. Never premium-gate this. |
| Sales history | `/sales` | Starter | Basic transaction review is operationally essential. |
| Shifts | `/shifts` | Starter | Till accountability and safe closing are baseline trust features. |

### Stock

| Surface | Route | Recommended Plan | Why |
|---|---|---:|---|
| Inventory | `/inventory` | Starter | Real stock visibility is a baseline retail need. |
| Stock adjustments | `/inventory/adjustments` | Starter | Damage, theft, and count corrections are core operations. |
| Stocktake | `/inventory/stocktake` | Starter | Physical count discipline should not be a premium-only process. |
| Products | `/products` | Starter | Product master data is foundational. |
| Product labels | `/products/labels` | Growth | Label-printing workflows are a stronger merchandising and control layer once the store is operating beyond the lean baseline. |
| Purchases | `/purchases` | Starter | Receiving stock and supplier buying are core workflows. |
| Stock transfers | `/transfers` | Pro | Multi-branch movement is operationally more complex and best reserved for higher-control businesses. |

### Money

| Surface | Route | Recommended Plan | Why |
|---|---|---:|---|
| Expenses | `/expenses` | Starter | Every business needs expense capture. |
| Detailed expense categories | inside `/expenses` | Growth | Richer chart-of-accounts categorisation belongs to businesses ready for tighter financial control. |
| Customer receipts | `/payments/customer-receipts` | Starter | Collecting customer money is core, especially in credit-heavy environments. |
| Supplier payments | `/payments/supplier-payments` | Starter | Paying suppliers is core AP hygiene. |
| MoMo reconciliation | `/payments/reconciliation` | Starter | Payment verification and fraud prevention should be universal. |
| Card/transfer reconciliation | `/payments/reconciliation/card-transfer` | Starter | Cash control is universal, not premium. |
| Expense payments | `/payments/expense-payments` | Starter | Paying operating obligations is core. |

### Customers and suppliers

| Surface | Route | Recommended Plan | Why |
|---|---|---:|---|
| Customers | `/customers` | Starter | Credit sales and customer history matter early. |
| Customer statements | `/customers/[id]` and statement export | Starter | Debt follow-up is operationally basic. |
| Suppliers | `/suppliers` | Starter | Supplier management is core. |
| Supplier statements | `/suppliers/[id]` and statement export | Starter | AP visibility should not be hidden behind a higher tier. |

### Reports

| Surface | Route | Recommended Plan | Why |
|---|---|---:|---|
| Dashboard | `/reports/dashboard` | Starter | Every store needs a quick operational view. |
| Cash drawer report | `/reports/cash-drawer` | Starter | Cash accountability is baseline control. |
| Exports | `/reports/exports` and export routes | Starter | Basic data portability should be universal. |
| Weekly digest | `/reports/weekly-digest` | Starter | A short management brief is useful even for smaller stores. |
| Analytics | `/reports/analytics` | Growth | Trend and category analysis fits the next maturity step. |
| Profit margins | `/reports/margins` | Growth | Margin discipline is a clear commercial value layer. |
| Reorder suggestions | `/reports/reorder-suggestions` | Growth | Predictive stock support is valuable once the business is more disciplined. |
| Income statement | `/reports/income-statement` | Growth | Full financial statements belong to businesses ready for deeper visibility. |
| Balance sheet | `/reports/balance-sheet` | Growth | Same reasoning as income statement. |
| Cashflow report | `/reports/cashflow` | Growth | Formal cashflow reporting belongs with financial statements. |
| Risk monitor | `/reports/risk-monitor` | Growth | Fraud/override/variance monitoring is a strong control upgrade. |
| Command center | `/reports/command-center` | Growth | This is a stronger operations-control surface than a basic dashboard. |
| Owner dashboard | `/reports/owner` | Pro | Executive business-health and leakage view is a top-tier owner-control feature. |
| Cashflow forecast | `/reports/cashflow-forecast` | Pro | Forecasting is a more strategic capability than reporting past/current position. |
| Audit log | `/reports/audit-log` | Pro | Full governance and action trace belongs in the top tier. |

### Settings and admin

| Surface | Route | Recommended Plan | Why |
|---|---|---:|---|
| Business settings | `/settings` | Starter | Basic configuration must remain universal. |
| Organization | `/settings/organization` | Starter | Core business identity and structure setup should be available from the start. |
| Receipt design | `/settings/receipt-design` | Starter | Receipt branding and print configuration are basic setup. |
| Import stock | `/settings/import-stock` | Starter | Bulk import helps onboarding and should not be premium-gated. |
| Notifications | `/settings/notifications` | Growth | Automated owner summaries and delivery diagnostics are valuable control enhancements. |
| Users | `/users` | Starter | Staff creation and role assignment are baseline management needs. |
| Account | `/account` | Starter | Profile and security controls are universal. |
| Onboarding / setup guide | `/onboarding` | Starter | Setup must never be premium-gated. |

## 5. Tools That Should Stay Operational, Not Paid Tier Gates

These should remain role-protected owner/admin tools, not commercial plan upsells:

- system health: `/settings/system-health`
- backup and restore: `/settings/backup`
- data repair: `/settings/data-repair`
- sale-cost correction tools and advanced recovery pages under data repair
- core security controls such as account access, password reset, 2FA, and session protection

Reason:
- when the business is already live, these tools protect trust, data integrity, and recoverability
- locking them behind a higher plan creates the wrong kind of pressure at the worst possible time

## 6. Product Decisions That Need a Firm Call

### A. Are customer receipts and supplier payments Starter or Growth?

Recommended answer:
- Starter

Reason:
- these are normal cash-collection and payment workflows, not executive analytics

### B. Is notifications/WhatsApp automation Starter or Growth?

Recommended answer:
- Growth

Reason:
- basic app usage should not depend on it, but owner automation is a clear upgrade value

### C. Is weekly digest Starter or Growth?

Recommended answer:
- Starter for basic digest
- richer owner summary can remain part of Growth/Pro surfaces

Reason:
- smaller stores still benefit from a short summary, but executive synthesis is a stronger premium feature

### D. Is multi-branch always Pro?

Recommended answer:
- yes, for the first commercial rollout

Reason:
- operational complexity, support burden, and internal control expectations all rise sharply once stock moves between branches

If needed later, multi-branch can become a paid add-on or a Growth-plus add-on, but Pro-first is the safer rollout.

## 7. Best Approach for Step 3: Upgrade and Change Flow

### Recommendation

Use assisted upgrades first, not self-serve billing first.

### Why this fits the market

- many businesses will upgrade through conversation, demonstration, and trust-building rather than card checkout
- some will pay by transfer, MoMo, or negotiated arrangements
- sales-led provisioning is easier to control early while the pricing model is still being refined

### Recommended flow

#### New businesses

- create business on Starter by default
- optionally give a time-limited Growth trial during onboarding or first 14 days
- let the owner experience margin and reporting value early

#### Locked features

When a user reaches a locked feature:

- explain what the feature does in business language
- show which plan unlocks it
- give one clear next action

Recommended messaging examples:

- `Balance Sheet is available on Growth and Pro.`
- `Owner Dashboard is available on Pro.`
- `Upgrade through TillFlow to unlock richer reporting and control.`

#### Upgrade path

Phase 1:
- plan updated by TillFlow staff or internal admin tooling
- app reflects the new plan immediately

Phase 2:
- internal admin interface for changing plan status cleanly

Phase 3:
- optional self-serve billing only if it becomes commercially useful

### Downgrade rule

Downgrades must never stop the shop from trading.

That means:

- POS stays usable
- inventory stays usable
- shifts stay usable
- historical data remains intact
- premium historical data remains available in read-only form for everything recorded before the downgrade
- any new activity after the downgrade follows the lower-plan access rules

## 8. Recommended Rollout Order

### Immediate

- add real `plan` field on `Business`
- keep the current compatibility bridge while migrating
- replace any remaining user-facing Simple / Advanced language

### Next

- gate all financial statements consistently behind Growth
- gate owner dashboard, audit log, and forecasting behind Pro
- move notifications automation into Growth

### After that

- add internal admin tooling for plan assignment
- add trial handling and locked-feature upgrade prompts
- review if any Starter surfaces need refinement after field feedback

## 9. Bottom-Line Recommendation

The best commercial structure for TillFlow in this market is:

- Starter: strong enough to run a real shop properly
- Growth: the main serious-business plan and the most important revenue tier
- Pro: executive control and multi-branch oversight

The system should charge for insight, discipline, and control depth, not for basic operational survival.