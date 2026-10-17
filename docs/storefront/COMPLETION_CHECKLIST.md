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

### Financial and staff acceptance — 17 October

- Existing Preview owner signed in. Expired copied trial renewed only on the isolated test branch.
- `ORD-JVQB`: manager confirmation → preparing → ready → collected. One ONLINE_ORDER invoice, one CONFIRMED TRANSFER receipt of 9600 pence; system cashier remains disabled. Journal debits/credits both 10600 pence (includes COGS).
- Banner persists through preparation/ready and refresh; disappears after collection. North branch hides Central orders and banner; switching back restores them.
- `ORD-NUMW`: unpaid cancellation closes order without creating a sale. `ORD-HG49`: paid cancellation creates one return, restores stock, sets MANUAL_REFUND_NEEDED and leaves refundedAt null.
- Found/fixed: bank-transfer return incorrectly labelled mobile money; refund journal credited Bank before actual refund payment. New storefront cancellations now credit Customer Refunds Payable; claimed manager settlement clears payable and credits Bank once. Historical refunds without that liability are not charged again. Payments arriving after cancellation without an invoice are booked to Bank/refund liability, not sales.
- Captured VAT is reversed even when merchant disables VAT after sale. Cancelled order pages no longer instruct customers to collect. Staff payment hint is tender-neutral; singular attention count corrected.
- Follow-up validation: 42 tests passed across return/action/provider/refund/financial suites; typecheck and lint passed. Hosted verification of these follow-up fixes remains pending.

### PostgreSQL races, refunds and permission evidence

- Hosted owner-only acceptance harness (`/qa/storefront`) is restricted to this exact Preview branch, isolated database host, fictional business and SMS-disabled fixture. No production path is enabled.
- Concurrent checkout retry, sale-posting retry, cancellation/posting race and two competing failed-payment expiry passes all passed against real Postgres. One reservation/invoice at most; cancelled orders restored stock once.
- New paid cancellation `ORD-PD8U`: TRANSFER return credits account 2200 (Customer Refunds Payable), not Bank. Manager settlement debits 2200 and credits Bank once. Legacy `ORD-HG49` settlement produces no second Bank debit/credit.
- Cashier server check rejected payment confirmation from a stale owner screen; fresh cashier screen hides financial actions and successfully marks a paid order as preparing. Fixture role restored to OWNER. Branch isolation and refresh persistence verified. Independent authenticated sessions and audible sound remain unverified.
- Customer refund progress and unresolved failed-payment/refund attention lists corrected.

### Reservation valuation and payment destination follow-up

- Found checkout discarded exact inventory value and omitted reservation stock movements. New checkout captures line cost/basis, preserves tracked balance value, records a reservation movement and links that same movement to the canonical invoice on payment without deducting stock twice.
- Unpaid cancellation/expiry restore the captured cost and record a release. Legacy/unknown costs remain explicitly unverified rather than inventing value.
- Orders snapshot their payment destination at checkout; later merchant payment-mode/account edits cannot change the public order instructions or canonical tender. Provider collections remain mobile money.
- Additive migration `20261017003000_storefront_reservation_snapshot`: nullable payment snapshot and line cost/basis columns; existing orders retain legacy fallback.
- Local validation: 139 tests passed across nine financial/order/payment suites; typecheck and targeted lint passed. Hosted exact-value regression is pending this commit's deployment.
- Catalogue release manifest prepared: six clear category corrections, 34 mixed-brand decisions and 196 explicit-size range candidates. Production catalogue edits, merchant product facts/images and final selection remain pending.

- Exact-value follow-up deployment `ERNwDhGTXj1ofMTEEMWNKPNvKrty` (`f142a07`) reached READY; additive migration verified applied on the isolated branch. Concurrent checkout retry now proves quantity 3→2, known value 100→67, captured cost 33 and exactly one stock movement.
- Conversion recording moved into the checkout transaction so serverless shutdown and response retries cannot drop or duplicate a placed-order event. SMS rendering now uses the captured payout destination.
- Final focused regression: 167 tests passed across 14 suites, including payment, stock costing, refunds, branch attention permissions, customer access, taxonomy, SMS enqueue deduplication and cron authentication. Typecheck and targeted lint passed.
