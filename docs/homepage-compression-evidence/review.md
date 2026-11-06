# TillFlow homepage compression review

The homepage has been shortened from 14 rendered section elements to 6, preserving the original hero, real operational proof, working demo, pricing and an obvious next step. The revised page presents the decision sooner instead of repeatedly describing cash, MoMo, stock and profit.

## Release identity and scope

- Source baseline: `5ad596eb38cb9449542669c210639a38179146cf`.
- Candidate: `56fe0019771546cb509e2ba964f05e0622e6efc9`.
- [PR 177](https://github.com/joshowusu-alt/TillFlow/pull/177), stacked on the still-unmerged live release PR 176.
- [Preview](https://supermarket-fkrp51ywx-joshua-owusus-projects.vercel.app/welcome) (Vercel authentication applies).
- Only welcome-page presentation, marketing components and the existing marketing structure test change. Prices, entitlements, demo calculations, registration logic, POS, finances, offline queues, database schema and migrations have identical source to the live baseline.
- The founder requested removing the complimentary-access sentence. The retained proof describes actual use without claiming that the customer pays, endorses a quote or achieved a measured result.
- Founder-supplied Facebook and TikTok links appear once each in the footer. Facebook retains the supplied share URL; TikTok uses the supplied profile path without tracking parameters. Automated destination access was blocked by the platforms; ownership and profile contents were not independently certified.

## Measurements

Chromium, a 900px viewport height, reduced motion, loaded fonts, monthly billing and collapsed disclosures. Before is the live website; after is the exact candidate's hosted preview. Full document height includes the header and footer. Counts use `.welcome-page section`; the baseline's 14 includes its nested pricing reassurance strip (13 other section elements), and excludes three repeated inter-section slogans. All five widths have no page overflow or browser runtime errors.

| Viewport width | Before height px | After height px | Reduction |
|---|---:|---:|---:|
| 320 | 14,075 | 4,992 | 64.5% |
| 360 | 13,681 | 4,735 | 65.4% |
| 390 | 13,533 | 4,587 | 66.1% |
| 768 | 10,238 | 3,826 | 62.6% |
| 1440 | 7,931 | 3,083 | 61.1% |

The main navigation remains sticky. The original `#control` anchor now reaches the concise demo heading. Product proof, customer and pricing anchors remain available. Expanded video, comparison and FAQs remain in normal document flow; these measurements do not hide overflow, shrink type or fix content to a viewport.

## Section decisions

| Existing section or block | Decision and reason |
|---|---|
| Hero and owner dashboard | Keep intact. It states the owner problem and already provides a product visual and two useful paths. |
| Early named proof and later EL-SHADDAI story | Consolidate immediately after the hero. Two versions add no new evidence. |
| Three promotional poster cards | Remove from the homepage. Tall, text-heavy artwork repeats the three benefits; embedded swipe wording also belongs to social creative. Assets remain available. |
| 28-second video | Keep on demand inside the compact demo section, with controls, captions and a text description. No autoplay or initial MP4 download. |
| Normal Ghana retail days | Remove. It restates the hero's recognition of the problem. |
| Four owner moments | Remove. The visitor does not need another problem list. |
| Moving operation-label belt | Remove. Repeating labels do not provide additional evidence. |
| Daily control and five benefit cards | Merge into three short demo entries: sales, stock and money. |
| Three inter-section slogans | Remove. They repeatedly delay the next substantive decision. |
| Four detailed product panels | Replace with direct working-demo links. The hero retains product evidence; the demo handles detailed exploration. |
| Mid-page WhatsApp demo invitation | Remove the separate section. The same action is available in the sticky header and hero. |
| Pricing preamble and reassurance chips | Remove duplicate explanations. Preserve all three plan cards, prices, annual toggle, storefront add-on, comparison and genuine registration CTAs. Keep one plan-fit WhatsApp action after the cards. |
| Four-step setup tutorial | Condense to one sentence. Keep the four expandable FAQs, including the offline preparation and sync caveat. |
| Final invitation | Keep concise. Correct link contrast and give it a 44px touch target. |
| Footer | Keep practical navigation, phone and the two requested social links in the existing footer. |

The final six sections are hero, operational customer proof, compact demo, pricing, FAQs and closing invitation. WhatsApp placements fall from five to four (header, hero, plan-fit help, close); links to the general demo fall from five to three, alongside three specific demo entry points. The original detailed comparison was already expandable, and is retained rather than claimed as a new compression change.

## Browser and accessibility verification

See [validation.json](validation.json) for 50 route/width checks across welcome, demo overview, demo dashboard, practice sale, inventory, reports, customers, storefront, Pro/annual registration and login at 320, 360, 390, 768 and 1440px. Requests permit only GET, HEAD and OPTIONS. The account-creation step is never submitted and no customer session is used. Registration checks advance through local UI screens only, with every server write blocked.

The checks verify monthly and annual prices and all three plan destinations, Pro/annual selection on registration, sticky section anchors, keyboard opening of the video, expanded comparison geometry, caption presence, offline FAQ text and the +233 54 701 6160 WhatsApp destination. POS, onboarding and products continue to require sign-in. Facebook and TikTok markup is checked without sending messages or interacting with accounts.

The changed homepage has zero automated WCAG 2/2.1 A/AA violations at all five widths, both collapsed and with the video/comparison expanded. Initial review found and corrected the closing link contrast and keyboard access to the horizontally scrolling comparison.

The unchanged login has three existing contrast nodes at all five widths. The unchanged demo inventory table has an existing keyboard-scrollability finding at 768px. Live-production checks reproduce the same rule IDs and targets; [baseline-a11y.json](baseline-a11y.json) retains that comparison. They are reported as inherited findings, not counted as new homepage regressions or described as zero site-wide violations. This is automated Chromium verification, not a physical iPhone/Safari or screen-reader certification.

## Engineering validation

- [Final CI](https://github.com/joshowusu-alt/TillFlow/actions/runs/42213487889): lint, typecheck, unit, build and POS safety. All five jobs passed; the unit suite reports 4,235 passed and 28 existing skips.
- [Final PostgreSQL smoke](https://github.com/joshowusu-alt/TillFlow/actions/runs/42213478177): uses a disposable runner-local PostgreSQL service, not production.
- Production dependency audit uses the existing high-severity gate: no high or critical issues; six moderate findings remain in the unchanged Sentry build-tool dependency chain. No dependency update or automatic audit fix is included.
- React review: no new client state, effects, data fetching or server actions; stable list keys; native disclosure/keyboard controls; captioned video; direct imports; unchanged pricing state and registration URL generation.
- A local build initially encountered a Windows directory permission error, then revealed the old checkout's stale generated Prisma client. After regenerating the current client, the final local production build passed with all database URL variables absent. Hosted builds also passed from a clean install. No application-code workaround or weakened type check is part of this change.

## Commercial critique

The original page asked visitors to keep agreeing with the same problem long after they understood it. Promotional posters, mock dashboards, lists and slogans competed with the actual demo and delayed pricing. At 390px, the campaign and detailed proof sections alone occupied about 6,485px. The product looked comprehensive, but the page made a small business owner work too hard to decide.

The shorter version has a clear job: recognise the problem, show that a real shop uses the product, let the visitor try it, show the price, answer objections and invite contact. It should be easier to scan and act on. That is an editorial assessment, not evidence of conversion uplift. One shop's operational use is useful proof but does not establish broad demand or paying adoption. The next commercial work is retailer conversations, demos, trial activation and paid retention, rather than another feature section.

## Minimal safe release request

Approve only candidate `56fe0019771546cb509e2ba964f05e0622e6efc9` for Vercel project `supermarket-pos` (`prj_Ndxzi9vvY6R5MMDPZYGe3GwkNcli`) once the final required checks pass. Do not merge PR 176 or PR 177, run production migrations, change Secrets, submit live registrations, create financial transactions or manipulate offline queues. Reconfirm production identity immediately before release, then verify welcome, demo, pricing and registration navigation, protected routes, assets and health with read-only requests.

Production at review remains `5ad596eb38cb9449542669c210639a38179146cf`, deployment `dpl_ESTwt1BkViSTvGBCRj6TNH16vXBm`. This is the preferred immediate rollback target for the homepage-only change and is reported READY and rollback eligible. The earlier fallback `dpl_BaobPjWAw4RDVtSm4ee4AJKBqLV9` also remains READY. A fresh rollback/health check belongs to the release preflight. No production release is authorised by this review.

## Screenshots

| Width | Before | After |
|---|---|---|
| 320 | [Before](before-320.webp) | [After](after-320.webp) |
| 360 | [Before](before-360.webp) | [After](after-360.webp) |
| 390 | [Before](before-390.webp) | [After](after-390.webp) |
| 768 | [Before](before-768.webp) | [After](after-768.webp) |
| 1440 | [Before](before-1440.webp) | [After](after-1440.webp) |
