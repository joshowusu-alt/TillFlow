# Loading Phase 1 — Skeleton & route-loader polish deployment

## 1. Verdict

**LOADING PHASE 1 DEPLOY PASSED — skeleton/route-loader polish is live.**

## 2. Scope confirmation

| Check | Result |
| --- | --- |
| Feature branch | `feature/loading-phase1-skeleton-polish` |
| Feature commits | `47b523bf` (polish) + `569ee621` (smoke probe) |
| Feature PR | [#100](https://github.com/joshowusu-alt/TillFlow/pull/100) → merge `431956c04cffb46f7be9c15199cd9b72f7e281db` |
| Prisma / migrations | **None** — no `prisma/` files in the change set; no production migration ran |
| Auth / session / middleware | **Unchanged** |
| POS checkout behaviour | **Unchanged** |
| Business / reporting / accounting logic | **Unchanged** |
| Root launch gating (Phase 2) | **Out of scope** — not changed |

### Root launch files untouched

Confirmed empty diff vs pre-merge master for:

- `app/launch/page.tsx`
- `components/LaunchRedirector.tsx`
- `components/AppLaunchLoading.tsx`
- `components/RootLaunchLoading.tsx`
- `app/loading.tsx`

### Files shipped

Runtime / UI:

- `app/(protected)/onboarding/ChecklistReadinessSkeleton.tsx` (new)
- `app/(protected)/onboarding/OwnerReadinessSkeleton.tsx` (comment; completed-home shape preserved)
- `app/(protected)/onboarding/loading.tsx` / `page.tsx`
- `app/(protected)/pos/loading.tsx` → single `PosBoardSkeleton`
- `components/CompactRouteLoading.tsx` (`expenses` / `list` variants)
- Route loaders: expenses, products, customers, suppliers, users, payments, shifts, settings

Tests / docs / probe:

- `lib/loading/phase1-skeleton-route-polish.test.ts`
- Related contract test updates
- `docs/loading/LOADING_SKELETON_SPLASH_INVESTIGATION.md`
- `docs/loading/LOADING_PHASE_1_SKELETON_ROUTE_POLISH.md`
- `scripts/loading-phase1-preview-smoke.cjs`

## 3. Hosted preview

| Field | Value |
| --- | --- |
| Preview SHA (validated polish) | `47b523bf099cea400f93aa89d5b24a800a5cf6a5` |
| Preview deployment | `dpl_2LWz1D943TrauhcbWfagqFmfK9D5` Ready |
| URL | https://supermarket-blhoj2sal-joshua-owusus-projects.vercel.app |
| Alias | https://supermarket-pos-git-feature-loadi-a1829d-joshua-owusus-projects.vercel.app |
| Probe | `scripts/loading-phase1-preview-smoke.cjs` → **PASSED** |
| Log | `tmp/loading-phase1-preview-validate.log` (local) |
| Preview seed tag | `LOAD_P1_1787353812010_43ee` (cleaned up after run) |

Preview checks (all **PASS**):

- Cold `/launch` still branded TillFlow
- Incomplete seeded tenant: checklist/setup UI (not stuck dark owner-home skeleton)
- Soft nav Home → Sell: saw POS-shaped skeleton; **no** “TillFlow POS” chip; **no** full launch message
- POS usable shell without branded route chip
- Expenses compact nav (no splash)
- Products / Customers / Suppliers / Users / Payments / Shifts / Settings load without POS chip
- Money Received, MoMo Confirmation, Business Movement, Dashboard load
- Soft nav → Home: saw checklist skeleton (no dark completed-home flash)

## 4. Local / CI gates

```
npx vitest run lib/loading/phase1-skeleton-route-polish.test.ts lib/loading/route-skeletons.test.ts …
→ focused suites green (55 related tests earlier; PR unit job pass)

npx tsc --noEmit          → exit 0 (pre-merge)
eslint touched files      → exit 0 (pre-merge)
npx next build            → exit 0 (pre-merge)

PR #100 CI: lint, typecheck, unit, build, pos-safety, Vercel — all pass
```

## 5. Production deploy

| Field | Value |
| --- | --- |
| Live production SHA | `431956c04cffb46f7be9c15199cd9b72f7e281db` (merge of #100) |
| Feature polish commit included | `47b523bf099cea400f93aa89d5b24a800a5cf6a5` |
| Vercel production | `dpl_6S7VPGeERvg5d7GM3mnrzGpwKQHe` Ready |
| Deployment URL | https://supermarket-edh8fu43n-joshua-owusus-projects.vercel.app |
| Live aliases | https://www.tillflow.app , https://tillflow.app |
| Migrations run on Production | **None** |
| Production data mutation | **None** (smoke read-only QA) |

### Alias note

After merge, custom domains were pointed with `vercel alias set` so tillflow.app / www.tillflow.app serve `dpl_6S7VPGeERvg5d7GM3mnrzGpwKQHe` before smoke.

## 6. Production smoke (controlled QA tenant only)

Probe: `SMOKE_MODE=production BASE_URL=https://www.tillflow.app node scripts/loading-phase1-preview-smoke.cjs`  
Log: `tmp/loading-phase1-production-smoke.log`  
Credentials: QA tenant (`.playwright-qa.local.env`) — **no inserts/updates/deletes**

All checks **PASS**, including:

- `/launch` branded
- Onboarding/checklist load
- Home → Sell: POS-shaped skeleton; no TillFlow POS chip; no full launch mid-nav
- POS shell usable
- Expenses / products / customers / suppliers / users / payments / shifts / settings
- Money Received, MoMo Confirmation, Business Movement, Dashboard

## 7. Confirmation matrix

| Requirement | Status |
| --- | --- |
| Root launch files untouched | **Yes** |
| No Prisma/schema/migration | **Yes** |
| No production data mutation | **Yes** |
| No business/reporting/accounting logic change | **Yes** |
| No auth/session/middleware change | **Yes** |
| No POS checkout behaviour change | **Yes** |

## 8. Remaining evidence for Phase 2 (root / random splash)

Still out of scope / needed before splash gating:

- Distinguish residual “splash” reports after Phase 1 (POS branded chip removed)
- Video: PWA icon reopen vs in-tab navigation
- Video: hard refresh on protected routes vs soft nav
- Confirm whether any remaining flash is `RootLaunchLoading` / `app/loading.tsx`

## 9. Verdict line

**LOADING PHASE 1 DEPLOY PASSED — skeleton/route-loader polish is live.**
