# Loading Phase 2C — Gated RootLaunchLoading hosted preview and production deploy

**Date:** 2026-08-22  
**Basis:** [`LOADING_PHASE_2B_GATED_ROOT_LAUNCH_LOADING.md`](./LOADING_PHASE_2B_GATED_ROOT_LAUNCH_LOADING.md)  
**Status:** Production live on tillflow.app / www.tillflow.app  

---

## Final verdict

**GATED ROOT LAUNCH DEPLOY PASSED — random launch splash removed from normal app navigation.**

Fullscreen “Opening your business…” now appears on production only during intentional `/launch` (including PWA `start_url`). Hard refresh, post-save landing, and report navigation no longer inherit root launch branding.

---

## 1. Branch / PR / SHAs

| Field | Value |
| --- | --- |
| Feature branch | `feature/loading-phase2b-gated-root-launch` |
| Feature PR | [#102](https://github.com/joshowusu-alt/TillFlow/pull/102) |
| Head commits | `3016a3c7` (gate) + `41180d99` / `d3b20322` (preview probe seed/cleanup) |
| Merge commit (production SHA) | `1e176577308e3c2120be9e525db55e052c909563` |
| Preview SHA (validated app) | `3016a3c7d81f0c349d4ef212436a12a0c6a31fb2` |
| Preview deployment | `https://supermarket-adt5etz7r-joshua-owusus-projects.vercel.app` Ready |
| Production deployment | `dpl_6u3QhqsoVJsDHnZNDfc1wEMyqyEE` Ready |
| Production URL | `https://supermarket-qkctv8kpz-joshua-owusus-projects.vercel.app` |
| Live aliases | `https://www.tillflow.app`, `https://tillflow.app` (`vercel alias set`) |

---

## 2. Scope confirmation

### Changed (Phase 2B)

- `lib/launch/launch-session.ts`
- `components/RootLaunchLoading.tsx`, `AppLaunchLoading.tsx`, `LaunchRedirector.tsx`, `LaunchSessionCompletion.tsx`
- `app/(auth)/loading.tsx`
- Tests, `scripts/loading-phase2b-gated-root-launch-probe.cjs`, Phase 2 / 2B docs

### Unchanged (empty diff vs pre-merge master)

- `/launch` route behaviour (`app/launch/page.tsx`)
- `public/manifest.json` `start_url` (`"/launch"`)
- `app/loading.tsx` still renders `RootLaunchLoading` (now gated internally)
- Phase 1 skeletons (`pos/loading.tsx`, onboarding checklist, compact reports loaders)
- `app/actions/users.ts` and other auth/checkout/reporting/user-management logic
- No `prisma/` / migrations

### Migrations / data

| Check | Result |
| --- | --- |
| Migrations run on Production | **None** |
| Production data mutation | **None** (QA smoke read-only) |
| Preview DB | Tagged `LOAD_P2B_*` owner seeded then **deleted** |

---

## 3. Preview probe

Script: `scripts/loading-phase2b-gated-root-launch-probe.cjs`  
Log: `tmp/loading-phase2c-preview-desktop.log`  
Viewport: **desktop**  
Result: **GATED ROOT LAUNCH PROBE PASSED**

| Check | Result |
| --- | --- |
| Hard `/login` | No Opening launch copy; no prior business-name leak |
| Hard `/onboarding`, `/pos`, `/users`, `/reports` | No launch copy |
| Hard Money Received / Business Movement / MoMo Confirmation | No launch copy |
| Soft Reports → Money Received | No launch copy |
| `/users?success=created` (post-save URL analogue) | No launch copy |
| Intentional `/launch` | Launch copy **present** |

iPhone 13 emulation: unauth `/login` also had no launch copy; owner login on that viewport was flaky (`ERR_ABORTED` / stayed on `/login`). Desktop preview + production desktop smoke cover authenticated routes.

---

## 4. Manual / workflow validation

| Scenario | How validated | Result |
| --- | --- | --- |
| PWA icon → `/launch` | `manifest.start_url` unchanged | Preserved |
| Desktop hard refresh on app pages | Preview + production probes | Splash removed |
| Create/edit user save | Code: users action does not set launch flags; probe: `/users?success=created` | No launch splash (no live user insert on production) |
| Report navigation in/out | Soft + hard probes | Splash removed |
| Phase 1 POS/Home skeletons | Unchanged files + settled `/pos` / `/onboarding` | Preserved |
| Owner→manager / tenant identity | Unchanged `business-identity` + login leak check | Preserved |

---

## 5. Local / CI gates

```
npx vitest run (phase 2b + phase 1 + identity + brand + cold-boot + components)
→ 8 files, 75 tests passed (pre-push)

npx tsc --noEmit          → pass
npx eslint <touched src>  → pass
npx next build            → pass

PR #102 CI: lint, typecheck, unit, build, pos-safety, Vercel — pass
```

---

## 6. Production smoke

```
SMOKE_MODE=production VIEWPORT=desktop BASE_URL=https://www.tillflow.app
node scripts/loading-phase2b-gated-root-launch-probe.cjs
```

Log: `tmp/loading-phase2c-production-smoke.log`  
Credentials: QA tenant (`.playwright-qa.local.env`) — **no inserts/updates/deletes**  
Result: **GATED ROOT LAUNCH PROBE PASSED**

Including: `/launch` branded; hard refresh `/pos`, `/users`, `/reports`, Money Received, Business Movement, MoMo Confirmation with no launch copy; Reports → Money Received; `/users?success=created`.

---

## 7. Behaviours

**Preserved**

- `/launch` branded / personalised launch
- PWA `start_url` `/launch`
- Phase 1 route skeletons
- Auth, checkout, reporting, user-management logic

**Removed**

- Random fullscreen “Opening your business…” on hard refresh of normal app routes
- Same splash on report navigation and post-save users landing URL

---

## 8. Remaining risks

| Risk | Notes |
| --- | --- |
| Live click-through create/edit user | Not mutated in production; URL analogue + action code checked |
| Installed PWA reopen | Expected branded `/launch` (not a bug) |
| iPhone-emulation preview login flake | Production desktop smoke passed; unauth mobile `/login` had no splash |

---

## 9. Verdict line

**GATED ROOT LAUNCH DEPLOY PASSED — random launch splash removed from normal app navigation.**
