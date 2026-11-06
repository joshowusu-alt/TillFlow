# TillFlow commercial upgrade — delivery record

Prepared 6 November 2026. Source baseline: `306a4be92da0ad42606dacbe89757d3bb4dfc6ee` (`master`). Branch: `remediation/commercial-website-upgrade`.

## Status and score

Draft PR only. No merge, deployment, production migration, subscription adjustment or customer-data write. Initial commercial assessment: **6.5/10**. Implemented candidate: **8/10**, provisional pending review and deployment verification. A 9+/10 claim would be premature: social ownership, testimonial evidence, field performance, full onboarding and a verified rollback remain outstanding. No conversion-rate uplift has been measured.

P0 findings: misclassified MoMo/card receipts; MoMo debt collection counted as cash; netted customer credits hiding gross receivables; contradictory 14/21-day descriptions; pricing CTA discarding selected plan; unsupported named customer outcomes. P1: mobile section navigation absent, animated story carousel unnecessary, no supplied media integration, practice checkout lacked tender/change. P2: storefront sitemap queried a customer database during builds; onboarding guidance and structured product metadata could be clearer.

## Reconciliation: exact baseline reproduced in Ghana time

`buildDemoLedger()` is the single source for public demo transactions, payment channels, stock balances and reports. It imports the deterministic fixtures in `lib/demo-fixtures/transactions.ts` and the catalogue in `products.ts`. All monetary values are integer pesewas. `reports.ts` derives views; pages must not independently calculate balances.

Window: 21 inclusive UTC/Ghana dates ending yesterday. Checked on 6 November: 16 October–5 November 2026. Changing the day changes the seeded weekday pattern; the figures below identify this checked window, not permanent hard-coded totals. The former local-time clock could also change fixtures between server timezones; the candidate uses UTC dates and weekdays consistently.

| Reported issue | Baseline/source | Corrected result for checked window |
|---|---|---|
| MoMo GH₵15,858.50 versus GH₵11,282.50 | `endingMomoPence` added card sales to MoMo sales | MoMo sales **11,282.50**; MoMo debt collection **800.00**; MoMo balance **12,082.50**. Card **4,576.00** separately. |
| 14 versus 21 days | Several page strings hard-coded 14; generator constant 21 | All affected page descriptions use `DEMO_PERIOD_DAYS`; day series includes zero-sales dates. |
| Netted debtor overpayments | Global max(credit sales minus collections, zero) | Receivables **1,153.50**, customer credits **726.00**; net **427.50**. Individual credits remain visible. |
| Cash versus liquid funds | All debt receipts treated as cash; card hidden in MoMo | Closing cash **10,353.00**, down **800.00**; total cash + MoMo + card **27,011.50**, unchanged. |

Cross-checks: sales **37,023.00**; cost of goods sold **28,329.00**; gross profit **8,694.00**; expenses **4,180.00**; net profit **4,514.00**; gross margin **23.48%** before display rounding. Purchases **14,676.00**; paid **10,404.00**; supplier payable **4,272.00**. Inventory opening **39,086.50** plus purchases less COGS equals ending **25,433.50**.

Assumptions disclosed in reports: purchases and expenses paid in cash; opening digital balances zero; card receipts treated as settled without fees. Customer receipts now carry explicit cash/MoMo methods, preserving their original amounts. Credits do not increase revenue. This is fictional fixture/accounting presentation work, **not evidence of an EL-SHADDAI accounting defect**.

Marketing product illustrations in `lib/marketing/demo-metrics.ts` are a separately labelled fictional daily preview, not the Adom 21-day trading history. Interactive practice sales are local React state and do not modify the reporting ledger or any tenant. Real accounting services were not changed.

## Implementation evidence

- `lib/demo-fixtures/{build-demo-ledger,reports,transactions,types}.ts`: payment classification, gross receivables/credits, UTC period and zero-sales chart dates.
- `app/demo/{dashboard,reports,pos}/page.tsx`: consistent period, separated cash/MoMo/card and customer credit disclosure.
- `app/demo/_components/DemoTrySale.tsx`: exact barcode/SKU Enter lookup, stock bounds, minimum cash coverage, tender/change receipt and accessible quantity/payment controls.
- `components/marketing/DemoJourneys.tsx`, `app/demo/layout.tsx`: four guided routes and shared conversion invitation; remove fragile fixed banner offset.
- `components/marketing/{RetailCampaignSection,PlanComparison,GettingStarted}.tsx`, `app/welcome/page.tsx`: supplied artwork/video, mobile section navigation, feature comparison, first-day guide, FAQ, footer contact and SoftwareApplication offers metadata.
- `components/WelcomePricingPreview.tsx`, `app/(auth)/register/page.tsx`, `components/RegisterForm.tsx`: selected plan/interval survive into signup. Query parameters are allow-listed; pricing, trial and server-side billing rules remain unchanged.
- `components/marketing/TrustProofSection.tsx`, `lib/marketing/welcome-content.ts`: remove unverified FENIBED/ASEDA narratives, unverified personal attribution and product-count/outcome assertions; retain confirmed operational use with complimentary Pro disclosure.
- `app/shop/sitemap.ts`: resolve database-backed storefront entries at request time instead of querying a customer database during compilation. Runtime sitemap still requires a functioning database.

## Supplied media decisions

All seven JPEGs visually inspected. Supplied video durations/size inspected and representative frames reviewed; no full audio transcription/caption audit was completed.

| Supplied asset | Decision/location |
|---|---|
| IMG_1201(1).jpeg | `public/marketing/retail-partner.webp`; first campaign card on `/welcome#retail`. |
| IMG_1501(1).jpeg | `public/marketing/every-sale.webp`; sale/records campaign card. |
| IMG_1476(1).jpeg | `public/marketing/understand-profit.webp`; profitability campaign card. |
| IMG_1829(1).jpeg | Held: repeats hero message; phone poster less specific than existing product visual. |
| IMG_1527(1).jpeg | Held: near-duplicate retailer poster and embedded “swipe” prompt. |
| IMG_1423(1).jpeg | Held: useful outreach problem creative; repetitive on this page, embedded “swipe”. |
| IMG_1380(1).jpeg | Held: “5 signs” cover expects a carousel; no accompanying five-sign sequence supplied. |
| problem_ad_v2, 28.2 seconds | `public/marketing/retail-challenges.mp4` and poster; native controls, no autoplay, `preload=none`, 540×960, fast-start. 11,178,554 → 1,430,890 bytes (~87% smaller). |
| jingle_v3, 41 seconds | Held for social/outreach; no need for three simultaneous homepage videos. |
| promo_v8, 66 seconds | Supplied file is **v8**, not brief’s v6. Held pending full spoken-claim and screen review. |

Artwork remains intact, including embedded branding/contact; no people are described as testimonial subjects. Images have descriptive alt text, responsive sizes and WebP delivery. No paid media provider or tracking service added. Captions were not supplied; page explicitly says so. A verified caption track and full audio review remain required before calling media accessibility complete. Raw photographic/source design files would permit a stronger hero and removal of poster-only “swipe” language without painting over images.

## Social, contact and pricing verification

Artwork and the live site's WhatsApp CTA agree on **+233 54 701 6160**, link `https://wa.me/233547016160`. HTTP lookup reached WhatsApp's send redirect; no message was sent and account responsiveness was not tested.

Facebook @tillflowapp, Instagram @tillflowapp and LinkedIn @tillflow are supplied handles. Searches did not establish official account URLs/ownership. **No social destinations were guessed or added.** Founder must supply profile URLs or verification evidence.

`lib/plan-pricing.ts`, pricing tests and feature definitions verify Starter **GH₵199**, Growth **349**, Pro **699** monthly, Growth storefront add-on **200** monthly, annual price equal to ten monthly charges. Feature comparison derives financial reports, audit/forecast and branch capability from `getFeatures`; the storefront row follows existing pricing rules. Staff/device limits, stock conversion and workflow-specific plan access are not advertised as verified in the new comparison. Live subscription enforcement and complimentary entitlement state were not queried or altered.

## Validation and limits

- 48 focused tests pass: reconciliation, practice checkout, marketing-content policy and existing pricing calculations.
- 231 existing POS safety unit tests pass across sales, cash drawers, purchase/expense linkage, payments and returns (7 files). These are unit regressions, not a new offline synchronization E2E certification.
- Typecheck passes; production build passes without database credentials after sitemap fix. Existing PosClient hook warnings remain. Local Node is 24; repository declares 22, so CI on its declared runtime is still required.
- Baseline and candidate welcome layouts checked at 320, 360, 390, 768 and 1440 pixels: no page-level horizontal overflow in either. Improvement is section navigation, media, truthful proof and clearer conversion flow, not a falsely claimed pre-existing overflow fix.
- See `commercial-evidence/browser-results.json` for initial route/geometry checks, and `production-browser-results.json` for final production-build workflow checks when present.
- Screenshots: `commercial-evidence/before-{320,390,1440}.webp` and matching after files. Development baseline screenshots contain Next's dev indicator; final after screenshots use a production build.
- Metadata/alt text/video behavior checked in browser. No field Core Web Vitals, paid-signup conversion measurement or full screen-reader audit claimed.
- Actual account creation → product → persisted sale was not run: no isolated seeded customer database was provisioned. Practice checkout and signup selection continuity are tested without submission.

## Release and remaining work

Existing `vercel.json` disables auto-deployment for `remediation/*`. This branch intentionally uses that rule because `build:vercel` includes `prisma migrate deploy`; a PR must not silently invoke migrations against an unverified target. No deployment command run. Vercel project discovery returned an older TillFlow project; scoped deployment-history lookup returned 403, and no authenticated Vercel CLI was installed. The current production SHA and known-good rollback are **unverified**, not inferred from `master`.

Next: (1) confirm the current deployment/project/rollback and test an isolated preview plus full onboarding/offline E2E; (2) supply official social URLs, media captions/raw photos and approved customer evidence; (3) run owner-assisted demos with real qualified prospects and record demo→trial→paid conversion before claiming commercial uplift. No changes to EL-SHADDAI data, subscription, users, receipts, costs or offline queues are needed for these steps.

## Final validation follow-up — 6 November 2026

This section supersedes the release blockers recorded above where expressly resolved.

- Correct production project verified through `www.tillflow.app`: **supermarket-pos**, project `prj_Ndxzi9vvY6R5MMDPZYGe3GwkNcli`, team `team_VGTyRWX5TGeB9svpc0mzxsLl` / `joshua-owusus-projects`. Git integration maps to `joshowusu-alt/TillFlow`. Team membership lists the connected founder as OWNER. The earlier 403 referred to an unrelated/older project, not this deployment.
- Current production and proposed fallback: **dpl_BaobPjWAw4RDVtSm4ee4AJKBqLV9**, SHA **306a4be92da0ad42606dacbe89757d3bb4dfc6ee**, READY, production aliases `www.tillflow.app` and `tillflow.app`, explicitly listed as a rollback candidate. Authenticated fetch of its `/welcome` returned **200**. Rollback execution has not been performed. Unique deployment hosts use SSO protection; custom domains are public.
- `build:vercel` now performs Prisma client generation and Next compilation only. `prisma migrate deploy` remains a separately invoked `db:migrate:deploy` command; opt-in supplier-credit fixture execution is moved to `test:supplier-credit:preview`. Neither is part of build or postinstall. `release-build-safety.test.ts` locks this boundary and the existing `remediation/*` auto-deploy exclusion. No production migration is authorised by this PR.
- Initial source CI: build, lint, typecheck and every POS-safety step passed. Unit failed four obsolete assertions in `lib/demo-fixtures/__tests__/reconciliation.test.ts` that still expected global debtor netting, MoMo collections as cash and card inside MoMo. Those assertions now reconcile gross receivables/credits and separate receipt channels; no assertions were skipped or arithmetic weakened.
- The customer screen had an additional presentation mismatch: rows showed net customer balances, while the footer used gross receivables. The footer now says **Net customer position** and sums those rows; a separate card shows customer credits. Shared demo layout displays the exact inclusive 21-day Ghana-time date range on every screen. Online pickup examples now reuse ledger invoices instead of unrelated fixed June fixtures, with workflow statuses explicitly illustrative. Demo storefront links stay on fictional routes instead of the optional database-backed shop. Expected checked-window amounts remain unchanged from the reconciliation table above.
- Persisted browser registration passed against disposable `release-176-isolated.db`: Pro/annual selection, GH₵6,990 recurring annual amount, owner, shop, till and chart of accounts persisted; first product created through the UI with GH₵39 price/GH₵25 cost; protected onboarding loaded. Evidence: `commercial-evidence/isolated-registration.json`.
- Real isolated API checkout and receipt passed. Native IndexedDB sale survived offline mode and browser reload, then reconnected to the real isolated API. The API committed a batch while its acknowledgement was deliberately aborted. Replay produced **one invoice, one payment and one unit of stock reduction**; refresh after acknowledgement did not upload again; receipt returned 200. Evidence: `commercial-evidence/isolated-offline.json`. This is actual SQLite persistence, not the earlier simulated API test. PostgreSQL-specific transaction behaviour is not newly certified by this browser test.
- Both new persisted workflows are in the existing POS-safety CI job. They refuse non-loopback URLs and any database other than the explicitly named disposable SQLite files. No real customer records or queues are used.
- Promotional video is now an explicitly silent edit (1,060,188 bytes) with reviewed visual sequence, English WebVTT captions and a visible text description. Original audio is omitted so no unreviewed spoken claims are published. Source promo remains with the founder. No other supplied video is added.
- Founder supplied Facebook share URL `https://www.facebook.com/share/1F2NDE5Zp2/`, Instagram `https://www.instagram.com/tillflowapp` and TikTok `https://www.tiktok.com/@tillflowapp`. Direct public retrieval was blocked/disabled; search did not verify profile content. These are recorded as founder-supplied destinations, not independently verified accounts, and remain excluded from the release. No LinkedIn URL was guessed. This optional marketing omission does not affect selling, signup or billing.
- Pricing and entitlements are unchanged: GH₵199/349/699 monthly; Growth storefront GH₵200 monthly; annual ten-month pricing. WhatsApp remains +233 54 701 6160. Customer proof is restricted to founder-confirmed operational use and the complimentary Pro disclosure.

Proposed release remains approval-only: create a production deployment of the PR's exact final head through the configured Git connection (`type=github`, `repoId=1153092591`, `ref=<exact head SHA>`), verified team and project, `target=production`. This action assigns production aliases when the build is ready. After approval only, perform read-only welcome/demo/registration/health checks and roll back to the verified deployment above if a critical check fails. No merge, migration, live registration, sale or queue operation is part of that action. All final-head required CI checks and local build evidence must be green before requesting release approval.


Final polish evidence: public-only CSS increases secondary-label, green-value and category-badge contrast; white-on-blue CTAs retain white text. Scrollable demo tables are keyboard-focusable named regions with visible focus outlines. Authenticated customer screens are outside this CSS scope. Local laboratory uses 390px, 4× CPU slowdown, 1.6Mbps download and 150ms latency; field Core Web Vitals and commercial conversion remain separate post-release measurements. The fallback deployment's `/api/health` returned HTTP 200, status healthy and database up (6 November); Redis is not configured. This is a read-only health check, not a production transaction test.

Existing migration-lock contract tests now enforce advisory locking on the separately invoked migration command and reject migrations in Vercel builds. No lock protection was disabled. Final focused reconciliation/build-boundary tests passed (39 tests). The production build command completed with all database URL variables absent; a separate build worktree prevented local dev watchers from racing build artifacts.

The release also pins Vercel's install command to `npm ci`, overriding any dashboard install override. The only root install lifecycle hook is the existing Prisma client generator. The release-boundary test rejects preinstall/install/prepare and pre/post-build hooks, so migrations cannot be reintroduced indirectly through root npm lifecycle scripts. Dependency versions and lockfile are unchanged.

Final public build checks passed across 50 route/width combinations (10 screens × 320/360/390/768/1440px), with no page overflow. Automated WCAG A/AA checks at 390px reported zero violations on those screens after contrast and keyboard-scroll fixes. Caption track and WhatsApp destination were present; no MP4 request occurred before playback. Throttled local laboratory LCP was about 2.2 seconds and CLS 0.0085; INP and real-user field performance are not certified by this measurement.

CI caught the new browser harnesses using direct Prisma constructors despite their strict local/file assertions. Both now use the repository's central `openGuardedPrismaClient` factory with an explicit disposable URL. The baseline allowlist and database-safety gate were not relaxed. This failure was corrected in source, not retried as flaky; the same safety gate caused the unit and Postgres-status jobs to fail before their final suites.
