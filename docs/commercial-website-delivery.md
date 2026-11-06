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
