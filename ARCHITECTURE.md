# TillFlow Architecture

## 1. System Overview

TillFlow is a Next.js 14 point-of-sale system built for African supermarkets and neighborhood retail operations. It combines POS checkout, inventory control, customer and supplier workflows, accounting, reporting, offline operation, and operational monitoring in one codebase.

The application is optimized for stores that need resilient browser-based cash operations, support for intermittent connectivity, and accounting visibility without a separate back-office system.

## 2. Tech Stack

- **Framework:** Next.js 14 with the App Router
- **Language:** TypeScript
- **ORM:** Prisma
- **Databases:** SQLite for local development and PostgreSQL for production
- **UI:** React 18 + Tailwind CSS
- **Offline layer:** Service worker + IndexedDB
- **Security and auth:** Session cookies, bcrypt password hashes, optional TOTP 2FA
- **Infrastructure:** Vercel deployment flow with Neon Postgres in production

## 3. Directory Structure

### `app\`
Application routes, server components, server actions, and API endpoints. Key areas include:
- `app\actions\` for business operations exposed as server actions
- `app\api\` for health, metrics, offline sync, webhooks, cron, and operational APIs
- `app\(auth)\` for login and registration flows
- `app\(protected)\` for authenticated POS, reporting, settings, and operational screens

### `lib\`
Core business logic and reusable server/client helpers:
- `lib\services\` contains domain services for sales, inventory, payments, purchases, returns, stores, users, and more
- `lib\security\` contains throttling, PIN, and two-factor helpers
- `lib\offline\` contains IndexedDB storage and sync orchestration
- `lib\accounting.ts` handles journal posting and chart-of-accounts bootstrap
- `lib\auth.ts` provides request-scoped auth and business context helpers

### `components\`
Shared UI components reused across pages and POS flows.

### `hooks\`
React hooks for shared client-side state and behavior.

### `prisma\`
Prisma schemas and seed data:
- `schema.prisma` for SQLite-oriented local development
- `schema.postgres.prisma` for PostgreSQL production deployment
- `seed.ts` for demo and bootstrap data

### `scripts\`
Developer and operational scripts such as Prisma generation, local DB setup, WAL enablement, QA scripts, and smoke checks.

### `public\`
Static assets, including the service worker (`public\sw.js`) and installable PWA assets.

## 4. Data Flow: Sale to Accounting Entry

The primary sales flow runs from the POS UI into server actions and then into the service layer:

1. A cashier completes checkout in the POS screen.
2. The UI calls a server action such as `completeSaleAction` in `app\actions\sales.ts`.
3. The action validates input, resolves the authenticated user via `requireUser()` or `withBusinessContext()`, and forwards normalized data to `createSale()` in `lib\services\sales.ts`.
4. `createSale()` loads the business, store, till, units, inventory balances, accounts, open shift, and optional customer or mobile money context in parallel.
5. The service computes pricing, discounts, promo effects, VAT, and final totals.
6. Inventory availability is checked before the transaction proceeds.
7. Prisma persists the sale, sale lines, payments, stock movements, and inventory balance updates in a coordinated transaction.
8. `postJournalEntry()` in `lib\accounting.ts` writes the accounting impact:
   - cash or bank debits for money received
   - accounts receivable when a sale is unpaid or part-paid
   - sales revenue credits
   - VAT payable entries when VAT is enabled
   - cost of goods sold and inventory movements
9. If the payment includes cash and the till is open, `recordCashDrawerEntryTx()` records a cash-drawer movement.
10. Risk monitoring hooks can create alerts for excessive discounting or negative-margin sales.

This means a completed sale updates inventory, cashier cash state, customer debt position, and the general ledger in one application flow.

## 5. Authentication Flow

TillFlow uses session-based authentication with business-scoped cookies:

1. `app\actions\auth.ts` verifies the user credentials and optional OTP.
2. A session token is written to an HTTP-only cookie named `pos_session_<businessId>`.
3. A companion `pos_active_business` cookie identifies the active business context when a user has multiple business sessions.
4. `middleware.ts` checks for a valid session cookie on protected routes and redirects anonymous users to `/login`.
5. On the server, `lib\auth.ts` resolves the current user from Prisma with `getUser()`.
6. `requireUser()` enforces authentication.
7. `requireRole()` enforces role access for `CASHIER`, `MANAGER`, or `OWNER`.
8. `requireBusiness()` and `requireBusinessStore()` add the current business and store context required by server actions and reporting code.

The auth layer is designed so business logic always runs inside an explicit user and business scope.

## 6. Key Services

The `lib\services\` folder is the core domain layer:

- **`sales.ts`** — creates and amends sales, validates stock, posts accounting entries, and records cash drawer effects.
- **`inventory.ts`** — adjusts stock levels and wraps inventory changes in transaction-safe helpers.
- **`purchases.ts`** — records purchases, updates inventory, and posts accounts payable and stock-related accounting entries.
- **`returns.ts`** — handles sale and purchase returns, refund logic, and accounting reversals.
- **`payments.ts`** — records supplier and customer payments and integrates with cash drawer entries.
- **`cash-drawer.ts`** — manages till open/close lifecycle and cash movement records.
- **`products.ts`** — manages product records, units, and product-unit mappings used by checkout pricing.
- **`stores.ts`** — manages store records and store-scoped configuration.
- **`users.ts`** — hashes passwords, enforces user constraints, and invalidates sessions when required.

Additional important services include:

- **`customers.ts`** for customer master data and credit-related flows
- **`suppliers.ts`** for supplier management
- **`mobile-money.ts`** for mobile money collections and webhook processing
- **`whatsapp-delivery.ts`** for WhatsApp delivery tracking and webhook event application
- **`risk-monitor.ts`** for operational fraud and leakage alerts
- **`day-closure.ts`** and **`shifts.ts`** for end-of-day and cashier shift controls
- **`stock-transfers.ts`** for multi-store inventory transfer workflows

## 7. Domain and Aggregate Boundaries

The Prisma schema is intentionally broad because TillFlow combines POS, stock, accounting, reporting, offline operation, and control-plane billing in one deployable system. The service layer should still treat the schema as a set of bounded contexts rather than one large mutable graph. A service should normally load and write through the aggregate it owns, then cross into another context through an explicit service call, accounting post, audit record, sync event, or notification.

`Business` is the tenant boundary. Most records carry `businessId` directly or inherit it through `Store`, `Branch`, or invoice ownership. `Store` and `Branch` are operational scopes used to partition inventory, till activity, reporting, and branch-specific customers; they are not a license to update every related child record from generic store code.

| Context | Aggregate root | Owned records | Boundary rule |
| --- | --- | --- | --- |
| Business setup and tenancy | `Business` | `Organization`, `Store`, `Branch`, `Device`, business settings, plan and receipt configuration | Owns tenant-level configuration and operational scopes. Feature gating and billing state should be resolved here before write actions proceed. |
| Identity and access | `User` | `Session`, `PasswordResetToken`, manager approval PIN state, 2FA state | Authentication code owns sessions and credential lifecycle. Domain services receive an authenticated user or user ID rather than reading cookies directly. |
| Product catalogue | `Product` | `ProductUnit`, `Category`, supplier preference, reorder thresholds, pricing fields | Product services own catalogue shape and unit pricing defaults. Sales and purchases snapshot prices and costs onto invoice lines instead of treating product fields as historical truth. |
| Inventory | `InventoryBalance` per store/product | `StockMovement`, `StockAdjustment`, `Stocktake`, `StocktakeLine`, `StockTransfer`, `StockTransferLine`, `ReorderAction` | Inventory quantities are store-scoped. Sales, purchases, returns, and transfers may move stock, but they should do so through transaction-safe inventory helpers and leave movement records. |
| Sales | `SalesInvoice` | `SalesInvoiceLine`, `SalesPayment`, `SalesReturn`, discount approval fields, sale-level external references | Sales is the checkout consistency boundary. Creating or amending a sale must coordinate invoice rows, payments, stock decrement/restoration, cash drawer effects, customer credit exposure, and ledger posting. |
| Purchases | `PurchaseInvoice` | `PurchaseInvoiceLine`, `PurchasePayment`, `PurchaseReturn` | Purchases own supplier invoice intake and inventory cost updates. Supplier balance, stock, and ledger effects should be posted from purchase services rather than generic payment or inventory screens. |
| Customers and receivables | `Customer` | customer credit terms, loyalty balance, customer-linked sales and statements | Customer services own customer master data and credit rules. Sales may reference a customer and update exposure, but customer history remains derived from invoices and payments. |
| Suppliers and payables | `Supplier` | supplier profile, preferred-product links, supplier-linked purchases and payments | Supplier services own supplier master data. Payables are derived from purchase invoices and supplier payments, not from mutable supplier balance fields. |
| Ledger and accounting | `JournalEntry` | `JournalLine`, `Account`, `OpeningBalance` | Accounting is append-oriented. Operational contexts post balanced journal entries through `postJournalEntry()` rather than editing ledger lines directly after the fact. |
| Till, shift, and cash drawer | `Shift` | `Till`, `CashDrawerEntry`, day cash expectations and closure approval fields | Cash drawer writes should be tied to an open shift when the business requires it. Sales, refunds, expense payments, and amendments record drawer movements through cash-drawer helpers. |
| Payments and reconciliation | `PaymentReconciliation` | method/date/store reconciliation state, recorded variances | Reconciliation compares operational payment records against actual settlement totals. It should not rewrite source sales or purchase payments except through explicit correction flows. |
| Mobile money collections | `MobileMoneyCollection` | `MobileMoneyStatusLog`, provider references and webhook metadata | Provider status belongs to the collection aggregate. Sales may attach a confirmed collection, while webhooks only update collection state and status logs. |
| Notifications and jobs | `MessageLog` | `ScheduledJob`, notification payloads, delivery status | Notification code owns outbound message history and scheduled job execution state. Business events should request notifications without directly mutating provider delivery rows. |
| Risk, audit, and compliance | `RiskAlert` | `AuditLog`, acknowledgement fields, risk context snapshots | Risk and audit records are append-first operational evidence. Domain services emit them as side effects and should avoid deleting or rewriting them during normal workflows. |
| Offline sync | `SyncEvent` | browser IndexedDB `salesQueue`, service-worker `pos-dead-letter` records, offline replay references | Offline writes are reconciled through idempotent sync endpoints. Server code stores durable `SyncEvent`/external references; browser-only queue and dead-letter stores are client recovery state. |
| Reporting and day closure | `DayClosure` | closure snapshots, report aggregates derived from invoices, inventory, payments, and ledger | Reports read across contexts but should not own source data. Day closure stores a point-in-time summary while underlying invoices, payments, and ledger entries remain the source of truth. |
| Control plane | `ControlBusinessProfile` | `ControlSubscription`, `ControlPayment`, `ControlNote`, `ControlStaff` assignments | Control-plane services manage account-manager review, support status, subscription state, and billing collection. Tenant app code consumes effective entitlement state rather than editing control rows directly. |

Cross-boundary writes should be rare and deliberate:

1. **Sale completion** is allowed to cross Sales, Inventory, Ledger, Cash Drawer, Customer Credit, Mobile Money, Risk, and Audit because checkout must commit a financially consistent transaction.
2. **Purchase recording** is allowed to cross Purchases, Inventory, Ledger, Supplier Payables, and Audit because incoming stock and supplier liability must agree.
3. **Returns and amendments** should reverse or adjust the original aggregate through explicit corrective records, not silent row edits.
4. **Reports** may query across contexts but should remain read-only except for saved closure or export artefacts.
5. **Offline replay** should be idempotent, business-scoped, and should produce the same aggregate effects as the online sale path.

When adding a model, first decide which aggregate owns it. If it does not have a clear owner, it is probably an event, audit record, report snapshot, or control-plane concern and should be named that way.

## 8. Offline Architecture

TillFlow includes a browser-first offline model for POS resilience:

1. `public\sw.js` registers a service worker and precaches key POS and offline routes.
2. The client caches product, business, store, till, and customer data via IndexedDB helpers in `lib\offline\storage.ts`.
3. Offline sales are stored in the `salesQueue` IndexedDB store with a synced flag.
4. When connectivity returns, `lib\offline\sync.ts` attempts a batch sync through `/api/offline/batch-sync`.
5. If batch sync is unavailable or fails, the client falls back to one-at-a-time sync through `/api/offline/sync-sale`.
6. The service worker also supports background sync and dead-letters permanent client-side failures for later review.

This design lets the POS continue capturing sales during outages while reconciling with the server when the network recovers.

## 9. Database Strategy

TillFlow uses a dual-schema Prisma strategy:

- **Development:** `prisma\schema.prisma` targets SQLite for easy local setup.
- **Production:** `prisma\schema.postgres.prisma` targets PostgreSQL for Vercel deployment.

Operationally:

- `npm run db:generate:local` generates the local Prisma client from the SQLite schema.
- `npm run db:setup` pushes the SQLite schema, enables WAL, and seeds data.
- `npm run build:vercel` generates Prisma from the PostgreSQL schema, applies committed migrations, and then builds Next.js.

Local iteration favors a portable SQLite database, while production uses Postgres connection strings such as `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING`.

## 10. Deployment

The primary production target is **Vercel + Neon Postgres**:

- `vercel.json` configures the production build command and route durations.
- `VERCEL_DEPLOY.md` documents Neon pooled and direct connection strings.
- `next.config.js` includes production security headers and Sentry/Vercel monitor hooks.

Local deployment remains possible with the SQLite-backed workflow:

- run `npm run dev`
- use the local Prisma schema and `dev.db`
- seed with `npm run db:setup`

That gives the project a lightweight single-machine development mode alongside a hosted production topology.

## 11. Monitoring and Observability

TillFlow ships with several operational checks:

- **Health endpoint:** `GET /api/health` checks core dependencies such as the database and optional Redis.
- **Metrics endpoint:** `GET /api/metrics` returns 24-hour operational counts and requires `METRICS_TOKEN` bearer auth.
- **Admin health endpoint:** `GET /api/admin/health` surfaces store-level operational metrics for managers and owners.
- **Structured logging:** `lib\observability.ts` emits JSON logs with timestamp, log level, message, request ID, and structured context.
- **Request IDs:** `middleware.ts` assigns `x-request-id` headers for log correlation.

Together these give operators both machine-readable health checks and business-aware operational telemetry.
