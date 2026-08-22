# Loading Phase 2B — Gated RootLaunchLoading

**Date:** 2026-08-22  
**Basis:** [`LOADING_PHASE_2_SPLASH_TRIGGER_DIAGNOSIS.md`](./LOADING_PHASE_2_SPLASH_TRIGGER_DIAGNOSIS.md)  
**Status:** Implemented locally — ready for hosted preview/deploy  

---

## Final verdict

**GATED ROOT LAUNCH READY — ready for hosted preview/deploy.**

Fullscreen TillFlow launch branding (`Opening your business…`) now appears only when `tillflow:launching` is set by `/launch`. Ordinary hard refreshes, post-save redirects, report navigation, and authenticated route transitions no longer inherit `app/loading.tsx` as a launch splash.

---

## Launch flag contract (confirmed)

| Event | Who | Storage |
| --- | --- | --- |
| **Set** | `LaunchRedirector` on `/launch` mount | `sessionStorage tillflow:launching = 1`; clears `tillflow:launchSplashSeen` |
| **Clear** | `LaunchSessionCompletion` after protected shell paints | sets `tillflow:launchSplashSeen = 1`; removes `tillflow:launching` |
| **Read (gate)** | `isIntentionalLaunchSession()` in `lib/launch/launch-session.ts` | launching === `'1'` **and** splashSeen !== `'1'` |
| Survives PWA icon reopen? | **No** (new document) until `/launch` runs again — then flag is **set** (intentional) | sessionStorage is per-tab; icon open → `/launch` is the intended ritual |
| Survives desktop hard refresh? | Flag **absent** after completion; refresh must **not** show launch | Gated RootLaunchLoading returns `null` |
| Survives form `redirect()` / `revalidatePath` / `router.refresh`? | Flag **not set** by those paths | Users action redirects to `/users?success=*` — no launch keys |
| Survives hard reload mid-handoff? | If `/launch` just set the flag and completion has not run, splash **may** still show once | Acceptable (still true launch) |

`/launch` page, `manifest.start_url`, and LaunchRedirector redirect target are **unchanged**.

---

## Implementation

### Files changed

| File | Change |
| --- | --- |
| `lib/launch/launch-session.ts` | **New** — shared flag keys + `isIntentionalLaunchSession()` |
| `components/RootLaunchLoading.tsx` | Gate: fullscreen `AppLaunchLoading` **only** when intentional launch; otherwise `null` |
| `components/AppLaunchLoading.tsx` | Uses shared `isIntentionalLaunchSession()` |
| `components/LaunchRedirector.tsx` | Uses shared keys (behaviour unchanged) |
| `components/LaunchSessionCompletion.tsx` | Uses shared keys (behaviour unchanged) |
| `app/(auth)/loading.tsx` | **New** — `null` so login/register do not inherit root splash |
| `app/loading.tsx` | Unchanged (still RootLaunchLoading) |
| `app/launch/page.tsx` | Unchanged |
| Tests / probe / docs | Phase 2B coverage |

Phase 1 route skeletons (`ChecklistReadinessSkeleton`, `PosBoardSkeleton`, `CompactRouteLoading`) **unchanged**.

---

## Before / after

| Scenario | Before | After |
| --- | --- | --- |
| Hard refresh `/pos`, `/onboarding`, reports | Fullscreen “Opening your business…” ~1s+ | No launch copy; route/protected skeletons or page |
| Hard refresh `/login` | Root launch then form | Auth `loading.tsx` null + gated root |
| Soft Link nav | Usually OK | Unchanged (still no launch) |
| `createUser` → `redirect('/users?success=created')` | Could flash root launch on full document nav | Gated off |
| Reports ↔ Money Received / BM | Could flash on full document nav | Gated off |
| PWA icon / `/launch` | Branded launch | **Still branded** (`LaunchRedirector` sets flag; handoff may still show RootLaunchLoading **with** flag) |
| Cached business name on `/launch` | Personalised | Unchanged; login still `ClearLaunchIdentityOnAuthEntry` |

---

## Tests / validation (local)

```
npx vitest run <phase 2b + phase 1 + identity + brand + cold-boot + components>
→ 11 files, 91 tests passed

npx tsc --noEmit          → pass
npx eslint <touched files> → pass
npx next build             → (run in this session)
```

Coverage includes:

- RootLaunchLoading **with** flag → fullscreen launch copy  
- RootLaunchLoading **without** flag → no “Opening your business…”  
- Splash-already-seen does not count as launch  
- `/launch` remains the only setter of the launching flag  
- Auth Instant Loading bypass  
- Reports/POS loaders have no launch copy  
- Login clears identity on auth entry (contract)  
- Business identity scope replace on tenant change (owner/manager of another tenant)  
- Phase 1 skeleton/route-loader tests still pass  

Probe (hosted, after preview): `scripts/loading-phase2b-gated-root-launch-probe.cjs`  
Hard-reloads `/onboarding`, `/pos`, `/users`, `/reports`, Money Received, Business Movement, MoMo Confirmation; soft Reports → Money Received; asserts launch copy **only** on `/launch`.

---

## Desktop / PWA / mobile / workflow validation

| Check | Status |
| --- | --- |
| Code-path: PWA `start_url` `/launch` | Unchanged — still intentional launch |
| Code-path: hard refresh gated | Unit + RootLaunchLoading gate |
| Code-path: user save `redirect('/users?…')` | No launch flags in `app/actions/users.ts` |
| Code-path: reports Instant Loading | CompactRouteLoading, no launch |
| Live desktop hard refresh | **Hosted preview** (probe) |
| Live mobile Safari/Chrome hard refresh | **Hosted preview** (probe `VIEWPORT` default mobile) |
| Installed PWA reopen | Expected `/launch` (not a bug) |
| Desktop wrapper | Same as browser document nav; gated |
| Create/edit user UI click-through | No logic change; preview smoke after deploy |

This phase does **not** deploy. Preview probe should be run on a hosted preview of this commit before production.

---

## Remaining risks

| Risk | Mitigation |
| --- | --- |
| `/launch` → `/onboarding` handoff might briefly show empty root loading if flag read races | Flag is set **before** `router.replace`; `useState(isIntentionalLaunchSession)` reads sessionStorage on the client first paint of loading UI |
| Users who never hit `/launch` (bookmark `/pos`) never see branded splash | Intended; PWA icon still uses `/launch` |
| `sessionStorage` unavailable (strict privacy) | `isIntentionalLaunchSession` false → no splash (fail closed) |
| Probe against **current production** will still see ungated splash until this ships | Expected |

---

## Preview / deploy recommendation

1. Open PR from this change set (no Prisma, no auth/checkout/reporting logic).  
2. Deploy **hosted preview**.  
3. Run `scripts/loading-phase2b-gated-root-launch-probe.cjs` (owner QA) on preview URL.  
4. Manual: `/launch` still personalises; hard refresh `/pos` and `/reports/business-movement` have no Opening splash; save user still lands on `/users`.  
5. Then production deploy.

---

## Verdict line

**GATED ROOT LAUNCH READY — ready for hosted preview/deploy.**
