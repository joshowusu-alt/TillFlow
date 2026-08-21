# Loading Phase 1: Skeleton & Route-Loader Polish

**Date:** 2026-08-21  
**Basis:** [`LOADING_SKELETON_SPLASH_INVESTIGATION.md`](./LOADING_SKELETON_SPLASH_INVESTIGATION.md)  
**Scope:** Confirmed high-confidence skeleton / Instant Loading polish only  

---

## Final verdict

**LOADING PHASE 1 READY — confirmed skeleton/route-loader polish ready for preview/deploy.**

Root launch / random splash gating was **not** changed (still needs confirmatory video).

---

## What changed

### Skeletons

| Skeleton | Change |
| --- | --- |
| **New** `ChecklistReadinessSkeleton` | Light checklist-shaped UI matching “Ready to sell” / setup journey (centred title, CTA bar, stage rows). No dark control-centre shell. |
| `OwnerReadinessSkeleton` | **Preserved** as completed-home dark control-centre skeleton. Documented as not for checklist Instant Loading. |
| `PosBoardSkeleton` | Unchanged shape; now the **sole** POS route Instant Loading UI. |

### Route loaders

| Route | Before | After |
| --- | --- | --- |
| `/onboarding` `loading.tsx` + Suspense | Dark `OwnerReadinessSkeleton` | Light `ChecklistReadinessSkeleton` |
| `/pos` `loading.tsx` | Branded Logo + “TillFlow POS” + duplicate wireframe | Single `<PosBoardSkeleton />` |
| `/expenses` | Legacy inline pulse | `CompactRouteLoading variant="expenses"` |
| `/products`, `/customers`, `/suppliers`, `/users`, `/payments`, `/shifts`, `/settings` | Legacy inline pulse | `CompactRouteLoading variant="list"` |

### Shared component

- `CompactRouteLoading` gained `expenses` and `list` variants (non-branded).

---

## Files changed

**Added**
- `app/(protected)/onboarding/ChecklistReadinessSkeleton.tsx`
- `lib/loading/phase1-skeleton-route-polish.test.ts`
- `docs/loading/LOADING_PHASE_1_SKELETON_ROUTE_POLISH.md`

**Updated**
- `app/(protected)/onboarding/loading.tsx`
- `app/(protected)/onboarding/page.tsx`
- `app/(protected)/onboarding/OwnerReadinessSkeleton.tsx` (comment only)
- `app/(protected)/pos/loading.tsx`
- `components/CompactRouteLoading.tsx`
- `app/(protected)/expenses/loading.tsx`
- `app/(protected)/products/loading.tsx`
- `app/(protected)/customers/loading.tsx`
- `app/(protected)/suppliers/loading.tsx`
- `app/(protected)/users/loading.tsx`
- `app/(protected)/payments/loading.tsx`
- `app/(protected)/shifts/loading.tsx`
- `app/(protected)/settings/loading.tsx`
- `lib/loading/route-skeletons.test.ts`
- `lib/performance/owner-readiness-streaming.test.ts`
- `lib/performance/cold-boot-handoff.test.ts`
- `lib/performance/playwright-qa-setup.test.ts`
- `lib/reports/report-streaming.test.ts`
- `lib/branding/business-language.test.ts`

---

## Deliberately not changed

- `/launch`, `LaunchRedirector`, `AppLaunchLoading`, `RootLaunchLoading`, `app/loading.tsx`
- `LaunchSessionCompletion` / session launch flags
- Auth / session / middleware
- Business, reporting, accounting, POS checkout behaviour
- `PosDeferredLoadingHint` (inline panel after POS shell — allowed)
- Nested report loaders with intentional dark owner panels (`reports/owner/loading.tsx`, etc.)
- Apple startup images / PWA `start_url`

---

## Policy applied

1. Incomplete onboarding Instant Loading → checklist-shaped light skeleton.  
2. Completed-home dark skeleton preserved as a separate component (not wired to `/onboarding` loading while journey is unknown).  
3. POS in-app nav → one non-branded POS-shaped skeleton (route loader === Suspense shape).  
4. Legacy list/form routes → compact non-branded skeletons.  
5. No TillFlow splash-like chips on normal route loading.

**Note:** Soft nav to completed Home may briefly show the checklist skeleton before the dark home stream. That is preferred over flashing dark dashboard before “Ready to sell” for new businesses.

---

## Tests / validation

| Check | Result |
| --- | --- |
| Focused vitest (phase1 + related loading/perf/brand) | **55 passed** |
| `npx tsc --noEmit` | **Pass** |
| ESLint on touched files | **Pass** |
| `npx next build` | **Pass** (pre-existing unrelated hook warnings in PosClient / PurchaseFormClient) |

Phase 1 contract tests assert:
- Onboarding loading/Suspense use checklist skeleton (no dark `bg-slate-900` in that path)
- POS loading has no “TillFlow POS” / Logo branded stage
- POS loading is a single `PosBoardSkeleton`
- Root launch files still present and unchanged in role

---

## Remaining evidence (Phase 2 / splash)

Still needed before root splash gating:

- Video: Home → Sell (confirm no full `/launch`; only POS skeleton)
- Video: PWA icon reopen vs in-tab navigation
- Video: hard refresh on `/onboarding` and `/pos`
- Confirm whether any residual “splash” is `RootLaunchLoading` vs misclassified POS branding (POS branding removed in Phase 1)

---

## Preview / deploy recommendation

**Safe to preview/deploy** as a visual loading-only change:

1. Deploy to preview.  
2. Manual smoke (mobile preferred):
   - Incomplete checklist business → open Home: light checklist skeleton, then Ready to sell / setup  
   - Home → Sell: one POS skeleton, no Logo / “TillFlow POS” chip  
   - Home → Expenses / Products: compact light skeletons  
   - Cold open via `/launch` still shows TillFlow launch (unchanged)  
3. Then production when preview looks stable.

No database, auth, or reporting migrations.

---

## Verdict line

**LOADING PHASE 1 READY — confirmed skeleton/route-loader polish ready for preview/deploy.**
