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

PerformanceObserver layout-shift entries named the POS checkout / cart regions, not fonts as the dominant source. `useMatchMedia` was the portrait cause. Welcome-shelf insertion was the landscape cause.

## Architecture after the fix

1. **One POS DOM** for phone and desktop. Chrome is CSS (`max-md` / `md` / `lg`), not `matchMedia`.
2. Empty-cart checkout: full panel stays in the tree with `max-md:hidden`; collapsed hint is `md:hidden`.
3. Filled-cart phone sheet is `md:hidden`; inline sale panel is `max-md:hidden`. Cart data, not viewport JS, decides whether the sheet exists.
4. `PosBoardSkeleton` matches empty-cart regions: search card, in-flow cart, compact till/checkout, welcome slot, desktop sidebar.
5. Deferred extras: `PosWelcomeShelfSkeleton` is the Suspense fallback so the welcome slot does not appear after first paint. Live shelf starts `visible=true`.
6. Compact-landscape POS header is sticky so barcode focus cannot scroll the hamburger off-screen. Barcode focus uses `{ preventScroll: true }`.
7. `/dev/loading-harness` is **deleted**. Production `next build` does not emit the route. Middleware always 404s it. Skeletons are tested as component fixtures (`lib/loading/route-skeleton-fixtures.test.tsx`).

## Direct `/pos` CLS after the fix (unthrottled attribution, n=5)

Chromium 149, no Slow-4G on this pass. Lab SQLite only.

| Viewport | Median | p75 | Range |
|---|---:|---:|---|
| 390×844 | 0 | 0.031 | 0–0.031 |
| 844×390 | 0 | 0 | 0–0 |
| 568×320 | 0 | 0 | 0–0 |
| 412×915 | 0 | 0.003 | 0–0.029 |
| 768×1024 | 0 | 0 | 0–0.001 |
| 1280×720 | 0 | 0 | 0–0.001 |

## Direct `/pos` CLS after the fix (identical Gate E Slow-4G harness, n=5)

Measured POS SHA `d3844c3ade8e41acea6a13758a1e4b23f7d0c6e7` vs Production `8bd7d54e`.

| Viewport / scenario | Production median | Final median | Final p75 | Final range | Budget |
|---|---:|---:|---:|---:|---|
| Portrait 390×844 direct `/pos` | 0.853 | **0.063** | 0.063 | 0.063–0.063 | **PASS** |
| Landscape 844×390 direct `/pos` | 0.156 | **0** | 0 | 0–0 | **PASS** |
| Portrait Home → POS | 0 | **0.031** | 0.031 | 0.031–0.031 | **PASS** |
| Landscape Home → POS | 0.017 | **0** | 0 | 0–0 | **PASS** |
| Desktop 1280×720 direct `/pos` | 0.124 | **0** | 0 | 0–0 | **PASS** |

Portrait Slow-4G still records a stable 0.063 (fonts / till-ready chip), far below the previous ~0.80 matchMedia swap and below 0.1.

## Zero-write

Lab SQLite after attribution and after Gate E: sales invoices 0, stock movements 0, purchase invoices 0, one OPEN shift (fixture). Complete Sale remains disabled until selected till **and** open shift are ready.

## Harness compile-out

`next build` route list includes `/dev/owner-home-preview` (existing owner-home fixture) and **does not** include `/dev/loading-harness`.

POS first-load JS: Production 39.1 kB / 176 kB; candidate 39.3 kB / 176 kB.

## Independent reviews (Gate F)

**POS visual / performance:** One CSS-controlled tree; skeleton regions match empty POS; no full-screen spinner; no oversized blank reservation; compact-landscape hamburger stays in viewport.

**Accounting / till / offline / security:** `tillReady` still requires selected till and an OPEN shift for that till. `canSubmit` still gates every Complete Sale control. Offline cart restore remains localStorage-only. Middleware 404s `/dev/loading-harness` in every environment, not via an env flag. No sale or financial write in the lab benches.
