# Storefront completion and release checks

Updated 17 October 2026. Scope: storefront only. Draft PR #134 targets master. Production is unchanged. **Not yet approved for live release.**

## Implemented and verified

- Durable checkout key/fingerprint; basket survives search, pagination, refresh and cancelled branch switches. Idempotent reservation and canonical sale posting.
- Captured prices, VAT, unit conversions, exact line costs and payment destination. New reservation movements link to the invoice without a second deduction. Cancellation/expiry restore captured values and audit the release.
- Manager/owner payment, cancellation and refund controls; cashier preparation/collection. Stale owner-screen payment confirmation rejected after role change. Fixture account restored to OWNER.
- Persistent non-dismissible branch-scoped attention banner, refresh/navigation persistence and outstanding-refund handling. Arrival sound is opt-in; stale connection feedback and focus refresh implemented.
- Paid cancellation credits Customer Refunds Payable (2200); actual refund settlement clears that liability and credits Bank once. Legacy returns are not charged twice. Late payment on cancelled unposted orders creates a refund obligation rather than resurrecting a sale.
- Failed-payment reservations expire; paid orders do not. Five-minute expiry, SMS dispatch and posting-recovery schedules configured. Vercel team Pro plan confirmed.
- Customer deadline, bank reference/instructions, pickup location, preparation estimate and wait-for-ready expectations. Cancelled/refunded orders explain refund state and no longer ask for payment or collection.
- Search loading states, focus traps/Escape/focus restoration, inactive mobile panels and background scroll lock.
- Exact category aliases take precedence over broad substring matches; merchant overrides remain authoritative. Thirteen taxonomy tests pass.
- Conversion event commits atomically with the order, including response retries. SMS enqueue uses the original payment destination and deduplicates events. Product order counts derive from actual order lines instead of nonexistent product-level conversion events.

## Acceptance evidence

- Dedicated Neon project `tillflow-preview`, branch `storefront-reliability-134` (`br-lucky-sea-zan9633f`); parent untouched. Runtime/migration secrets are restricted to `fix/storefront-reliability-alerts` in Vercel project `supermarket-pos`.
- Fictional storefront `storefront-preview-134`, two branches and 65 fictional products. SMS disabled. No real payment/provider calls made.
- Additive checkout-key and reservation/payment-snapshot migrations applied successfully to isolated Preview. Both Prisma schemas aligned.
- 167 targeted tests passed across 14 suites: sales, returns, order actions/services, payment sync/commit, refunds, financials, attention permissions, customer access, taxonomy, SMS enqueue and cron authentication. Typecheck and targeted lint pass.
- Real PostgreSQL hosted harness is owner-only and additionally bound to this exact branch, database host, fictional business and SMS-disabled setting. Test records retained.

| Hosted test | Evidence |
| --- | --- |
| Concurrent checkout retry | `ORD-CS4M`: one order; quantity 3→2; known value 100→67; captured cost 33; one reservation movement. |
| Concurrent sale posting | `ORD-5Q9H`: one invoice; quantity 2→1; known value 67→33; captured cost 34 retained on invoice; same movement linked to sale. |
| Cancellation versus posting | `ORD-79ME`: cancelled; refund obligation retained; quantity 1→1 and known value 33→33; no duplicate invoice. |
| Concurrent expiry passes | `ORD-GKVN`: expired once; quantity 1→1 and known value 33→33; release recorded. |
| Posted paid cancellation | `ORD-5Q9H`: cancellation restored captured cost 34; remaining quantity 2 and known value 67. |
| Complete collection | `ORD-JVQB`: payment → preparing → ready → collected; one invoice/CONFIRMED TRANSFER receipt for 9600; balanced journal; banner cleared on collection. |
| Refund settlement | `ORD-PD8U`: return credits 2200, not Bank; settlement debits 2200/credits Bank once. Legacy `ORD-HG49` settlement creates no second cash journal. |
| Payment snapshot | Changed fictional shop to MoMo/different bank account; `ORD-CS4M` retained original bank/reference. Test settings restored. |
| Branch and permissions | North hides Central orders; returning restores them. Cashier cannot confirm payment; cashier can mark a paid order as preparing. |
| Analytics | Hosted report matches persisted view/product/cart/checkout/order events; no product orders inferred from missing product event IDs. |

## Required before live release

- [ ] **SMS permission/access:** supply one authorised Ghana test number and approve at most five messages. Approve making the existing Arkesel key available only to this Preview branch through Vercel; do not paste credentials in chat. Then verify received/payment/ready messages, provider delivery and retry behaviour. Preview currently has no SMS sending key; production key remains production-only.
- [ ] **Merchant product facts:** review `CATALOGUE_RELEASE_REVIEW.md` and `catalogue-release-manifest.json`. Six category corrections are prepared; 34 mixed-brand listings need the supplied brand/variant confirmed; 196 explicit-size range candidates need selling-unit/availability confirmation. Only 28 of 530 published products have images; retain consistent fallbacks unless exact matching images are supplied.
- [ ] **Merchant pickup/payment facts:** confirm actual recipient, pickup address, contact, opening hours and prep estimate. Hosted acceptance used clearly fictional details.
- [ ] **Physical-phone and independent staff check:** small width, landscape, soft keyboard, touch targets, arrival sound, slow/offline recovery and a second independent authenticated staff session. Current browser supports desktop testing but exposes no phone viewport controls or independent session creation. Do not claim these passed.
- [ ] **Catalogue release application:** apply approved category/visibility changes and verify recommendations against the corrected data. No production catalogue mutations have been made.
- [ ] **Release approval:** review latest commit/deployment/CI, approve production migration/deployment, then verify production health and observe the scheduled jobs. Preview does not run production cron schedules.

## Approvals already supplied

GitHub upload/commit, branch publication and draft PR creation; isolated database connection to this exact storefront Preview and its deployment. These approvals do not need to be requested again. Vercel browser access and Preview owner sign-in work; no additional login is currently required.
