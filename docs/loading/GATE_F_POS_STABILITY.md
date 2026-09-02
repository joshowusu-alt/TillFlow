# Gate F — POS CSS-first stability

Laboratory only. Not field CrUX. No Production writes. No merge.

## Element-level CLS before the fix (Gate E candidate `fd7b32ac`)

Direct `/pos` document loads used `useMatchMedia` (`max-width: 767px`) with **false on SSR**. Hydration then swapped:

| Cause | Viewport | Typical contribution |
|---|---|---|
| Full checkout (`CustomerSelector` + payment panel) replaced by collapsed “Paid · Cash ready” | 390×844 | **~0.80** (dominant) |
| Duplicate till chrome (compact chip vs expanded form) | phone portrait | included in the same swap |
| Desktop empty-cart / F2 actions unmounted | phone portrait | included in the same swap |
| `PosDeferredLoadingHint` (“Preparing checkout…”) unmounting above the till | all | small |
| `PosWelcomeShelf` inserting after deferred extras (`visible` started `false`) | landscape + tablet | **~0.12** |
| Product-grid skeleton that the live POS does not use | route loader | extra first paint |

Production `8bd7d54e` portrait `/pos` CLS ~0.85; candidate ~0.80. Landscape 0.155 → 0.118. Both failed the 0.1 budget.

## Architecture after the fix

1. **One POS DOM** for phone and desktop. Chrome is CSS (`max-md` / `md` / `lg`), not `matchMedia`.
2. Empty-cart checkout: full panel stays in the tree with `max-md:hidden`; collapsed hint is `md:hidden`.
3. Filled-cart phone sheet is `md:hidden`; inline sale panel is `max-md:hidden`. Cart data, not viewport JS, decides whether the sheet exists.
4. `PosBoardSkeleton` matches empty-cart regions: search card, in-flow cart, compact till/checkout, welcome slot, desktop sidebar.
5. Deferred extras: `PosWelcomeShelfSkeleton` is the Suspense fallback so the welcome slot does not appear after first paint.
6. `/dev/loading-harness` is **deleted**. Production `next build` does not emit the route. Middleware 404s it if revived. Skeletons are tested as component fixtures.

## Direct `/pos` CLS after the fix (lab, n=5, Chromium 149, no Slow-4G on this pass)

| Viewport | Median | p75 | Range |
|---|---:|---:|---|
| 390×844 | 0 | 0.031 | 0–0.031 |
| 844×390 | 0 | 0 | 0–0 |
| 568×320 | 0 | 0 | 0–0 |
| 412×915 | 0 | 0.003 | 0–0.029 |
| 768×1024 | 0 | 0 | 0–0.001 |
| 1280×720 | 0 | 0 | 0–0.001 |

Budget: **below 0.1**. Portrait and landscape medians are 0.

## Zero-write

Lab SQLite `tmp/gate-f-lab.db` after attribution: sales invoices 0, stock movements 0, purchase invoices 0, one OPEN shift (fixture). Complete Sale remains disabled until selected till **and** open shift are ready.

## Harness compile-out

`next build` route list includes `/dev/owner-home-preview` (existing owner-home fixture) and **does not** include `/dev/loading-harness`.
