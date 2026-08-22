# Loading Phase 2 — Splash Trigger Diagnosis

**Date:** 2026-08-22  
**Mode:** Diagnosis only — **no code changes to launch flow, no deploy, no data mutation**  
**Prior:** Phase 1 skeleton/route-loader polish is live and preserved  

---

## Final verdict

**SPLASH DIAGNOSIS PASSED — root cause identified and fix scope ready.**

The “random splash” after Phase 1 is primarily **`app/loading.tsx` → `RootLaunchLoading` → `AppLaunchLoading` (`mode="launch"` + `shell="fullscreen"`)** painting on **full document navigations / hard refreshes** of routes that do not short-circuit root Instant Loading (and briefly on `/login`). It is **not** soft in-app Link navigation within the protected shell (when Link navigation actually occurs).

**Recommended fix type:** **root launch gating** (with optional auth-route Instant Loading null, same pattern as `welcome/loading.tsx`).

**Go / no-go for implementation:** **GO** for a narrow, gated RootLaunchLoading change + tests — **after** an explicit Phase 2 implementation brief. Do **not** change `/launch` behaviour for true app open / PWA `start_url`.

---

## Confirmations (this step)

| Requirement | Status |
| --- | --- |
| No production deploy | **Yes** |
| No production data mutation | **Yes** (read-only Playwright against tillflow.app) |
| Root launch flow not changed | **Yes** (read-only inspection) |
| Phase 1 loading polish preserved | **Yes** (no edits to Phase 1 loaders) |

---

## 1. Splash / loading surface inventory

| Surface | Component / file | Fullscreen branded? | Gated by `tillflow:launching`? |
| --- | --- | --- | --- |
| Canonical launch page | `app/launch/page.tsx` + `LaunchRedirector` | **Yes** (own fixed shell) | Sets flag; does not read it for visibility |
| Root Instant Loading | `app/loading.tsx` → `RootLaunchLoading` → `AppLaunchLoading` | **Yes** (`shell="fullscreen"`) | **No** — fullscreen + launch copy whenever this UI mounts |
| AppLaunchLoading internal | same component, `mode="internal"` | Only if `shell="launch"` **and** launching flag | Partially (shell=launch) |
| Protected Instant Loading | `app/(protected)/loading.tsx` → `ProtectedRouteLoading` | No | N/A |
| Route Instant Loading | e.g. `pos/loading.tsx`, `onboarding/loading.tsx`, CompactRouteLoading | No (Phase 1) | N/A |
| Welcome Instant Loading | `app/welcome/loading.tsx` → `null` | No | Explicitly bypasses root splash |
| Auth Instant Loading | **None** under `app/(auth)/` | Falls through to **root** loader | N/A |
| Apple startup images | `app/layout.tsx` + `public/splash/*` | Native OS only | N/A |
| PWA start | `manifest.json` `start_url: "/launch"` | Navigates to `/launch` | Via LaunchRedirector |
| SW precache | `public/sw.js` includes `/launch` | Does not rewrite in-app Links | N/A |
| LaunchSessionCompletion | clears `tillflow:launching` after protected shell mount | No UI | Clears flag |

**Only production consumers of `AppLaunchLoading` / `RootLaunchLoading`:** `app/loading.tsx` (and tests). `/launch` does **not** use `AppLaunchLoading`; it inlines logo + `LaunchRedirector`.

---

## 2. Expected behaviour map

| Scenario | Expected surface | Notes |
| --- | --- | --- |
| First app open / PWA icon open | OS startup image (iOS) → `/launch` | `start_url` intentional |
| Authenticated `/launch` | `/launch` then `router.replace('/onboarding')` | LaunchRedirector sets `tillflow:launching=1` |
| Soft Link nav within protected | Route / protected skeletons only | Phase 1 polish |
| Hard refresh on protected route | **Today:** root fullscreen launch UI (~1–1.6s) then page | **Unexpected** product-wise |
| Hard refresh on `/login` | **Today:** root fullscreen launch then login form | **Unexpected**; welcome already bypasses via `loading.tsx = null` |
| Hard refresh on `/welcome` | No root splash | welcome loading returns null |
| Auth redirect after login | `/onboarding` or `/pos` — not `/launch` | middleware / login page |
| Business identity loading | Copy only | Does not mount splash |
| Offline / sync | NetworkStatus / offline pages | Not TillFlow launch splash |
| Pull-to-refresh | Route remount / skeletons | Not `/launch` |

---

## 3. Reproduction matrix (evidence)

**Tooling:** `scripts/loading-phase2-splash-diagnosis.cjs` (read-only)  
**Target:** `https://www.tillflow.app`  
**Artifacts:** `tmp/loading-phase2-evidence/diagnosis-mobile.json`, `diagnosis-desktop.json`, screenshots `01–10-*.png`  
**Logs:** `tmp/loading-phase2-diagnosis-mobile.log`, `…-desktop.log`

| Scenario | Viewport | Expected | Observed | Duration (approx) | Acceptable? |
| --- | --- | --- | --- | --- | --- |
| Unauth `/launch` hard | mobile/desktop | `/launch` branded | Launch page (`#tillflow-launch-message` / logo) | brief → redirect if session | **Yes** |
| Unauth `/login` hard | both | Login form (no launch) | **Root fullscreen** “Opening your business…” then login | ~0.5–1.7s | **No** |
| Unauth `/welcome` hard | both | Welcome (no launch) | Welcome; no Opening copy | — | **Yes** |
| Owner `/onboarding` hard | both | Checklist/home or route skeleton | **Root fullscreen** Opening… then home | **~1.6s** (mobile) | **No** |
| Owner `/pos` hard | both | POS skeleton / shell | **Root fullscreen** Opening… then POS | **~1.1s** | **No** |
| Owner soft POS → Home | both | Checklist/home skeleton | **No** Opening / no fixed splash | — | **Yes** |
| Owner soft Home → POS | both | POS skeleton | Script often **fell back to `page.goto`** (owner tabs lack `/pos`) → looked like hard nav splash; Phase 1 smoke with working Link saw **POS skeleton only** | — | Soft Link: **Yes**; hard goto: **No** |
| Owner soft Home → Expenses | both | Compact loader | No root Opening splash | — | **Yes** |
| Owner `/launch` then handoff | both | `/launch` then protected | Personalized “Opening TillFlow QA Demo…” on `/launch`, then **same copy on fullscreen RootLaunchLoading** during `/onboarding` handoff | continuous handoff | **Yes** for cold launch |
| Cashier `/pos` hard | both | POS shell | **Root fullscreen** Opening… then POS | ~1s+ | **No** |
| Installed PWA reopen | code | `/launch` every icon open | Proven by `manifest.start_url` + LaunchRedirector always resetting flags | — | **Yes** if product wants launch each open; feels “random” if user thinks app was still open |
| Incomplete onboarding soft nav | Phase 1 | Checklist skeleton | Phase 1 preview seed: checklist skeleton | — | **Yes** (Phase 1) |

**Not fully automated here:** real device installed-PWA kill/reopen video (code path is unambiguous).

---

## 4. Trigger matrix (summary)

| Scenario | Expected | Observed | Acceptable | Likely source |
| --- | --- | --- | --- | --- |
| PWA icon / `/launch` | Launch page | Launch page | Yes | `/launch` + LaunchRedirector |
| Hard refresh protected | Minimal shell / route skeleton | Fullscreen launch UI | **No** | `app/loading.tsx` / RootLaunchLoading |
| Hard refresh `/login` | Login | Fullscreen launch UI | **No** | Root loading (no auth `loading.tsx`) |
| Soft Link protected↔protected | Route skeleton | Route skeleton | Yes | Phase 1 loaders |
| `/launch` → onboarding handoff | Continuous branded launch | Launch then RootLaunchLoading | Yes (cold boot) | LaunchRedirector + root loading |
| Auth delay alone | — | Does not open `/launch` | — | Ruled out |
| Business identity cache | Copy only | Does not mount splash | — | Ruled out as mount cause |
| Service worker | — | Precaches `/launch`; does not inject mid soft-nav | — | Low for soft nav |

---

## 5. Root cause assessment

### Primary (proven)

**`RootLaunchLoading` is unbound from app-entry.**

```tsx
// app/loading.tsx → RootLaunchLoading
<AppLaunchLoading mode="launch" shell="fullscreen" />
```

- `shell="fullscreen"` forces fullscreen UI **whenever root Instant Loading mounts**.
- `useLaunchCopy` is also true when `shell === "fullscreen"`, so users see launch copy (“Opening your business…” / personalised name) even when `tillflow:launching` is **not** set.
- Hard refresh / full document navigation to `/pos`, `/onboarding`, `/login`, etc. mounts root Instant Loading for ~1–1.6s under CPU throttle (real devices often shorter but still visible).

This matches user reports of a TillFlow splash “at the wrong time” after Phase 1 removed the POS branded chip.

### Secondary (expected, may be misread as “random”)

1. **Every PWA icon open** hits `/launch` and **resets** `tillflow:launching` / clears `launchSplashSeen` — full launch ritual again.  
2. **Cold handoff** `/launch` → protected still paints RootLaunchLoading with personalised copy (continuity by design).

### Soft navigation

- True client Link soft nav within protected **does not** need root splash (POS→Home diagnosis + Phase 1 Home→Sell smoke).  
- Diagnosis scenario `06-owner-soft-home-to-pos` is **contaminated**: owner bottom tabs do not expose `/pos`, script fell back to `page.goto` (hard navigation).

### Not the primary cause

- Phase 1 route skeletons (checklist / PosBoardSkeleton / CompactRouteLoading)  
- Middleware forcing `/launch` on in-app nav  
- Branch/till deferred POS hint  
- SW rewriting soft navigations  

### Identity / privacy (spot checks)

| Check | Result |
| --- | --- |
| `/launch` personalises with cached name | **Yes** (“Opening TillFlow QA Demo…”) |
| Same-business owner → cashier | Same cached name — **OK** (same tenant) |
| Login clears cache when `ClearLaunchIdentityOnAuthEntry` mounts | Component present on login; **server redirect of still-authenticated sessions skips the client clear** (expected). LogoutForm still clears. Unit tests cover clear/sync. |
| Cross-user leak | Scope token + clear on mismatch in `syncLaunchBusinessIdentity` — still the contract; no Phase 2 code change |

---

## 6. Risk assessment

| Item | Risk | Note |
| --- | --- | --- |
| Leaving RootLaunchLoading ungated | High UX | Hard refresh / reopen tab feels like app relaunch |
| Gating RootLaunchLoading incorrectly | Medium | Could blank cold boot or break `/launch` → home continuity |
| Changing `/launch` / start_url | High | Out of scope unless product changes PWA reopen policy |
| Auth `loading.tsx = null` | Low | Matches welcome; avoids login splash |
| SW changes | Medium | Not required for primary fix |

---

## 7. Recommended fix scope (do **not** implement in this step)

**Choose: root launch gating** (+ small auth Instant Loading bypass).

### In scope

1. **`RootLaunchLoading` / `app/loading.tsx` behaviour**  
   - Fullscreen launch branding **only** when an explicit app-entry condition holds, e.g.  
     - `sessionStorage tillflow:launching === '1'` and splash not yet completed, **or**  
     - documented cold-entry equivalent  
   - Otherwise: **`null`** or a **non-branded** minimal content placeholder (not “Opening your business…”).
2. Optional: `app/(auth)/login/loading.tsx` (and register if needed) returning **`null`**, mirroring `welcome/loading.tsx`.
3. Contract tests: hard-refresh protected path must not assert Opening launch copy; `/launch` still personalises; cold handoff still continuous when launching flag set.
4. Playwright: hard refresh `/pos` / `/onboarding` / `/login` — no fullscreen Opening splash; soft Home→Sell still no `/launch`; `/launch` still works.

### Out of scope

- Changing `/launch`, LaunchRedirector redirect target, manifest `start_url`, Apple splash assets  
- Phase 1 skeleton redesigns  
- Auth/session/middleware/checkout/reporting  
- Deploy until implementation PR approved  

### Alternative (not preferred as sole fix)

- **PWA reopen-specific handling** alone — does not fix browser hard refresh.  
- **Protected-shell gating only** — root loading still wraps outside protected.

---

## 8. Tests required before implementation merge

1. Unit/contract: RootLaunchLoading does not force fullscreen launch copy when not launching.  
2. Unit: `/launch` + LaunchRedirector still set flags and personalise.  
3. Unit: welcome + auth loading bypass root splash.  
4. Playwright hard refresh `/pos`, `/onboarding`, `/login` — no `Opening your business` / fixed z-9999 launch shell.  
5. Playwright soft nav Home → Sell — no `#tillflow-launch-message`.  
6. Playwright `/launch` authenticated — still shows branded launch then protected handoff.  
7. Identity: login (unauthenticated) clears cached name; scope mismatch clears prior tenant.

---

## 9. Explicit go / no-go

| Decision | |
| --- | --- |
| Implement Phase 2 splash gating now? | **GO** — root cause proven; scope is narrow |
| Change `/launch` / PWA start_url? | **NO-GO** unless product asks to stop relaunch-on-icon |
| Ship without hard-refresh gating? | **NO-GO** if “random splash” complaints continue |

---

## Appendix — evidence pointers

- Diagnosis script: `scripts/loading-phase2-splash-diagnosis.cjs`  
- Mobile/desktop JSON + PNGs: `tmp/loading-phase2-evidence/`  
- Phase 1 deploy (soft nav POS skeleton OK): `docs/loading/LOADING_PHASE_1_SKELETON_ROUTE_POLISH_DEPLOYMENT.md`  
- Prior investigation: `docs/loading/LOADING_SKELETON_SPLASH_INVESTIGATION.md`

---

## Verdict line

**SPLASH DIAGNOSIS PASSED — root cause identified and fix scope ready.**
