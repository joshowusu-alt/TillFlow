# Storefront reliability and staff order attention

This branch is a review candidate, not a production release.

## Behaviour

- Basket product records are independent of catalogue search/filter results. Saved baskets hydrate their product IDs from the public, published catalogue, including items outside the initial page. Branch changes ask before clearing the basket.
- A browser checkout key and server fingerprint return the original order after a lost response. A unique `(businessId, checkoutKey)` index makes concurrent duplicate attempts roll back their stock reservation. Old clients without a key remain compatible.
- Logged-in cashiers, managers and owners get a non-dismissible banner while online orders or refunds remain outstanding. It polls every 15 seconds, refreshes on focus and supports opt-in sound. This is an in-app alert; a closed browser does not receive push notifications.
- The selected operational branch scopes alerts and the console. An unscoped cashier receives no orders. Managers/owners without a selected branch can see their business's branches. Cashiers can prepare, mark ready and collect posted orders; managers retain payment, cancellation and refund authority.
- Orders remain visible through ready-for-pickup. Failed sale posting and unresolved refunds remain visible. Deep links fetch a specific order, including older orders outside the most recent 100.
- Payment confirmation cannot be followed by preparation until a sales invoice is linked. Online posting uses the captured order amounts and VAT, permits only the disabled system cashier for this path, confirms the manager-verified receipt and links the invoice within its transaction. Bank-transfer orders use transfer tender.
- Cancellation claims the current order state and composes stock restoration or the canonical sales return in the same transaction. Repeated/stale transitions cannot apply stock restoration twice. Batch preparation also checks the current state.
- Unpaid expiry and SMS outbox retries run every five minutes. SMS immediate sending now claims the same outbox lock used by the retry dispatcher. A separate job retries unposted paid orders; managers also have a retry button. Customer payment instructions expose the configured deadline.

## Deployment and validation limits

An additive migration adds nullable checkout key/fingerprint fields and a unique index. Apply and verify it in an isolated Preview database before any production release.

Vercel project inspection returned 403 for `joshua-owusus-projects`; no authenticated Vercel CLI is installed here. Hosted Preview configuration, target database, cron plan support and runtime flows could not be verified. Auto-deployment of this exact review branch is disabled in `vercel.json` because `build:vercel` runs database migrations. Remove that single branch entry only after verifying its isolated Preview database target.

Focused tests cover basket continuity/restoration, retry identity, captured-price/VAT posting, verified receipt treatment, branch scope, role permissions, cancellation claims, sale posting failure, refunds remaining visible and existing POS/cash-drawer/payment/return behaviour. Lint has three pre-existing warnings in POS/purchase components.

## Acceptance work still required in Preview

1. Apply the migration and run two concurrent checkouts with the same key; verify one order and one stock reservation.
2. Complete an order through manager payment verification, cashier preparation, ready notification and collection. Verify invoice, receipt, journal, stock movement and both staff/customer screens.
3. Race payment confirmation against expiry; race cancellation against sale posting. Verify one financial result and one stock restoration at most.
4. Test a real SMS provider and the cron retry/locking behaviour; local tests do not prove delivery.
5. Walk phone and desktop screens, including sticky header/banner, keyboard, slow/offline recovery, restored basket and branch switching. Capture evidence before release.
6. Correct the merchant catalogue: inaccurate product/category assignments, mixed-brand listings, abbreviations and missing images. Catalogue data has not been modified on this branch.
7. Verify provider-webhook transitions in Preview: confirmed receipts remain confirmed under stale failure events, and late payments on cancelled orders remain cancelled with a refund flag. The current checkout creates manual-reference orders rather than initiating a provider collection.
