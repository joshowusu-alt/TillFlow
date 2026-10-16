# Full storefront completion scope

Baseline review: 5/10. This checklist is the agreed scope. A code checkmark does not mean the feature has passed hosted acceptance testing. Nothing on this branch has been released to production.

## 1. Reliability

- [x] Basket contents/prices independent of search and pagination; hydrate saved items outside page one.
- [x] Confirm before clearing a basket on branch change.
- [x] Durable checkout request identity with a database uniqueness constraint.
- [x] Snapshot order prices/VAT into canonical sale posting; link invoice atomically.
- [x] Manager-verified receipts remain confirmed; transfer orders use transfer tender.
- [x] Disabled system cashier usable only by the validated online-order commit path.
- [x] Visible and scheduled recovery for paid orders without posted sales.
- [x] Atomic cancellation/return/reservation restoration; reject repeated, stale and backwards transitions.
- [x] Expire both awaiting-payment and failed-payment reservations; do not expire paid orders.
- [x] Serialize provider events with order changes; late confirmed payments on cancelled orders require refunds; stale provider failures cannot downgrade paid orders.
- [ ] Prove retry, expiry, cancellation and posting races using real Postgres in an isolated test branch.
- [ ] Verify stock, invoice, receipts, journals and returns across the complete workflow.

## 2. Staff notifications

- [x] Persistent, non-dismissible banner across protected screens, surviving navigation/refresh through server state.
- [x] Correct business and selected branch scope; no all-branch orders for unscoped cashiers.
- [x] Reference, age, amount, branch, status, total outstanding count and direct order link.
- [x] Keep preparation, ready-for-pickup, posting failures and refunds outstanding until resolved.
- [x] Optional arrival sound, 15-second polling, refresh on focus and clear stale-connection message.
- [x] Cashier console/preparation/collection access; payment/cancellation/refund actions remain manager/owner controlled.
- [ ] Verify two concurrent staff sessions and branch switching on the hosted app.
- [ ] Verify sound, refresh persistence, outstanding refund and recovery screens on desktop and phone.

## 3. Catalogue

- [x] Replace unsupported popularity/curation claims with truthful selection labels.
- [ ] Correct inaccurate categories and merge redundant public categories using the existing mapping tools.
- [ ] Prepare a focused publishable range with accurate brand, size and selling unit.
- [ ] Resolve mixed-brand/ambiguous SKU listings with merchant evidence; do not guess the supplied item.
- [ ] Add matching product images where available, consistent fallbacks otherwise; verify the highest-value range visually.
- [ ] Verify recommendations only after category data is corrected.

## 4. Payment and collection confidence

- [x] Show payment deadline and clarify merchant verification after transfer.
- [x] Show pickup branch/address, supplied opening status, preparation estimate and store contact action at checkout.
- [x] State pickup-only and wait-for-ready expectations; say when opening hours/address have not been provided.
- [x] Improve debounced search loading states rather than briefly claiming no results.
- [x] Trap keyboard focus in product/cart/checkout panels, close with Escape, restore focus, hide inactive mobile panels and lock background scrolling.
- [ ] Verify hours, payment recipient, reference, totals and collection instructions against actual merchant setup.
- [ ] Test small phone widths, soft keyboard, landscape/resize, sticky staff banner, touch targets and slow/offline recovery.

## 5. Notifications, measurement and release

- [x] Keep immediate SMS dispatch and coordinate it with outbox retries via a shared claim lock.
- [x] Configure five-minute expiry/notification/posting recovery jobs.
- [ ] Verify hosting plan supports these schedules and observe actual invocations.
- [ ] Send a small number of test SMS messages to an explicitly authorised test recipient and verify delivery/retries.
- [ ] Verify existing visit/product/cart/checkout/order analytics and use them to identify drop-off.
- [x] Publish the review branch/draft PR after explicit GitHub destination approval (PR #134).
- [ ] Restore Vercel access for team `joshua-owusus-projects`, inspect project `supermarket-pos`, and confirm isolated Preview database configuration before enabling this branch's deployment.
- [ ] Apply additive migrations to isolated Preview and complete all hosted acceptance checks with fictional operational data.
- [ ] Present the tested release candidate and remaining risks before any production release decision.

## Access requests

1. Explicit approval to upload the storefront changes to `joshowusu-alt/TillFlow`, branch `fix/storefront-reliability-alerts`, and create/update its draft pull request. Automatic approval review rejected the earlier upload because this specific destination approval was missing.
2. Reconnect Vercel with an identity authorised for `joshua-owusus-projects/supermarket-pos`. The installed connector returned HTTP 403. Permission is needed to inspect configuration and create/test an isolated Preview deployment; no passwords or tokens should be shared in chat.
3. Provide one authorised test SMS recipient and approve a maximum of five test messages to that number. These are for order-received, payment-confirmed, ready-for-pickup and failure/retry validation.

Neon access is working. Read-only inspection has verified the separate project `tillflow-preview` (`divine-art-49113159`), branch `br-calm-scene-zaiqf94o`, database `tillflow_preview`. Do not reset or use the shared Preview database as disposable test data; use an isolated child branch for operational testing.

## Isolated Preview deployment — 17 October 2026

- Dedicated Neon branch: `storefront-reliability-134` (`br-lucky-sea-zan9633f`) in project `tillflow-preview`.
- Both Prisma runtime and direct migration connections saved as Vercel Secret variables, restricted to `fix/storefront-reliability-alerts`, after explicit user approval.
- Parent contains 54 applied migrations and zero online orders; checkout-key migration is pending the hosted build.
- Direct PostgreSQL from the local workspace is unavailable (P1001); use the hosted build for migration and deployed application for integration verification.
- Automatic Preview deployment enabled after verifying both branch-specific variables. Production variables unchanged.

### First hosted acceptance results

- Deployment `dpl_Aa97YdC5RoiZQvfQpVtC26FbfRPT`, commit `c39b10359e38ef5b4418abd50716431e649478ff`, reached READY; checkout migration applied successfully (verified through Neon).
- Fixture storefront `storefront-preview-134`: 65 fictional products, two branches, SMS disabled.
- Browser: basket retains biscuits while searching rice; both items hydrate after refresh; cancelling branch switch preserves basket and GH₵96 total.
- Checkout: order `ORD-JVQB`, two lines, total 9600 pence, retry key persisted. Central stock decreases 100→99 for each item; North stays 100.
- Analytics: view, add_to_cart and checkout_start persisted. Product-view and conversion reporting still need verification.
- Acceptance found and corrected a brief false empty search state on reload, unsupported 30–60 minute preparation claim, and missing pickup location on the pending order screen. Follow-up typecheck, lint and 10 order-service unit tests passed.
- Remaining: full financial transitions, concurrency, permissions, two staff sessions, phone checks, actual catalogue corrections, SMS delivery and release checks.
