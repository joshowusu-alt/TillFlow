# Loading, Skeleton & Splash Consistency Investigation

**Date:** 2026-08-21  
**Scope:** Protected app loading / skeleton / splash / route-transition surfaces  
**Status:** Investigation only — no product fixes applied in this phase  
**Environment note:** Live Playwright video capture was **not** available (local app server down on `:6200`; `PLAYWRIGHT_*` credentials not present in this shell). Findings below are from full static route/component analysis, existing unit/contract tests, and code-path reproduction sequences. Confirmatory mobile video should be attached during the implementation PR.

---

## Final verdict

**LOADING INVESTIGATION PARTIAL — more reproduction evidence needed before implementation.**

Static root causes for the three primary visual defects are **high confidence** and sufficient to draft a controlled fix plan. Live frame/video confirmation of “random splash during in-app navigation” is still required before changing launch-gating behaviour, because several surfaces look TillFlow-branded and can be misclassified as the full launch splash.

**Implementation posture:**
- **Conditional GO** for checklist skeleton + POS double-skeleton + route-skeleton unification (safe, layout-only).
- **HOLD** on changing `/launch` / `RootLaunchLoading` / session launch flags until one confirmatory capture shows which surface is flashing in-app.

---

## Executive summary

| Symptom | Primary source | Classification |
| --- | --- | --- |
| Dark dashboard skeleton before “Ready to sell” checklist | `OwnerReadinessSkeleton` (`bg-slate-900` control-centre hero) used for **all** `/onboarding` loads | **Invalid flash** for incomplete checklist; valid for completed owner home |
| Extra TillFlow-branded moment before POS | `app/(protected)/pos/loading.tsx` (Logo + “TillFlow POS”) then `PosBoardSkeleton` then optional deferred hint | **Invalid flash** / stacked route + Suspense skeletons |
| “Random” full TillFlow splash in normal use | `/launch` (PWA `start_url`) + `app/loading.tsx` → `RootLaunchLoading` (always fullscreen launch) + POS branded loader mistaken for splash | Mix of **allowed app-entry splash** and **invalid / misclassified flashes** |
| Inconsistent mobile skeletons | Three families: `CompactRouteLoading`, legacy inline `loading.tsx`, dark owner/report skeletons | Allowed route skeletons, but **uncontrolled style drift** |

---

## 1. Loading surface inventory

### 1.1 Launch / splash family (app entry)

| Component / route | Role | When it appears |
| --- | --- | --- |
| `app/launch/page.tsx` + `LaunchRedirector` | Canonical TillFlow launch surface | PWA open (`manifest.start_url: "/launch"`), explicit `/launch` navigation |
| `components/AppLaunchLoading.tsx` | Shared branded loader (fullscreen or content) | Via `RootLaunchLoading`; fullscreen when `shell="fullscreen"` **regardless of session flags** |
| `components/RootLaunchLoading.tsx` | Root cold-start UI | `app/loading.tsx` only |
| `app/loading.tsx` | Root segment Instant Loading UI | Soft/hard navigations that suspend at the **root** child boundary (not under a more specific `loading.tsx`) |
| Apple `apple-touch-startup-image` links in `app/layout.tsx` | Native iOS cold-launch frames | OS/native only — **preserve** |
| `public/splash/*.png` | iOS startup images | OS/native only — **preserve** |
| `LaunchSessionCompletion` | Clears `tillflow:launching` / sets `tillflow:launchSplashSeen` | Mounted in protected layout (+ duplicate on POS page) after shell ready |
| `BusinessNameSaver` / `lib/launch/business-identity.ts` | Personalises launch copy from cached business name | Does **not** itself show splash; affects copy only |
| `ClearLaunchIdentityOnAuthEntry` | Clears cached name on login | Auth entry — not a visual splash |

**Session flags**

- `sessionStorage['tillflow:launching'] = '1'` set by `LaunchRedirector` on `/launch`
- Cleared by `LaunchSessionCompletion` after `LAUNCH_COMPLETION_HOLD_MS` (120ms) once protected shell mounts
- `AppLaunchLoading` with `shell="fullscreen"` (root) **does not** consult these flags for visibility — fullscreen is unconditional

### 1.2 Protected shell / route Instant Loading UI

| File | Kind | Style |
| --- | --- | --- |
| `app/(protected)/loading.tsx` → `ProtectedRouteLoading` | Generic protected fallback | Light cards / “Loading page…” |
| `app/(protected)/onboarding/loading.tsx` → `OwnerReadinessSkeleton` | Owner home-shaped | **Dark** `slate-900` hero + light cards |
| `app/(protected)/pos/loading.tsx` | POS-shaped + brand chip | Logo + “TillFlow POS” + product/cart skeleton |
| `inventory` / `sales` / `my-sales` / `purchases` / `reports` `loading.tsx` | `CompactRouteLoading` | Light compact list/report shapes |
| `expenses` / `products` / `customers` / `suppliers` / `users` / `settings` / `payments` / `shifts` | Inline legacy pulse skeletons | Light cards; not shared component |
| `reports/command-center/loading.tsx` | Compact custom | Light |
| `reports/owner/loading.tsx` | Heavy owner intelligence | Includes **dark** `slate-900` panels |
| `reports/balance-sheet` / `cashflow-forecast` | Inline legacy | Light |
| `app/welcome/loading.tsx` | `null` | Intentionally bypasses root launch splash |

### 1.3 Suspense / inline panel skeletons

| Location | Fallback | Classification |
| --- | --- | --- |
| `onboarding/page.tsx` | `OwnerReadinessSkeleton` | Route/page Suspense (duplicates route `loading.tsx`) |
| `pos/page.tsx` | `PosBoardSkeleton` | Inline after auth gate |
| `PosBoard` → deferred section | `PosDeferredLoadingHint` (“Preparing checkout…”) | Inline panel |
| `OwnerHomeCompletedStream` | `HomeKpiSkeleton`, attention/IYR skeletons, etc. | Inline panel (dark hero metrics) |
| Reports dashboard / owner / analytics | `ReportSectionSkeleton` | Inline panel |
| Protected layout `OwnerSetupBanner` | `null` | No flash |
| Root layout `ToastProvider` | bare `<Suspense>` (no fallback) | Potential blank suspend edge; not branded splash |

### 1.4 Other related components

- `components/CompactRouteLoading.tsx` — Phase 2a mobile-first shared skeletons  
- `components/ProtectedRouteLoading.tsx` — calm generic protected shell  
- `components/Skeleton.tsx` — generic shimmer primitives (less used by route loaders now)  
- `components/owner-home/skeletons.tsx` — completed Home section skeletons  
- `app/(protected)/onboarding/OwnerReadinessSkeleton.tsx` — **dark dashboard** home skeleton  
- `app/(protected)/pos/PosBoardSkeleton.tsx` — POS-shaped Suspense skeleton (no logo)  
- `components/PullToRefresh.tsx` — soft refresh can remount Suspense trees (POS protected when transaction active)

---

## 2. Route-by-route loading map (focus routes)

### Home (`/onboarding` — Owner bottom tab “Home”)

| Stage | Surface | Notes |
| --- | --- | --- |
| Soft nav into `/onboarding` | `onboarding/loading.tsx` → **dark** `OwnerReadinessSkeleton` | Always, regardless of checklist vs completed home |
| Page Suspense | Same dark skeleton again | Double exposure of same UI |
| Content (incomplete) | `OnboardingClient` → `ReadinessJourney` (“Ready to sell” / checklist) | Light gradient checklist — **does not match skeleton** |
| Content (complete) | `OwnerHomeCompletedStream` | Dark hero control centre — **matches skeleton** |

### Sell / POS (`/pos`)

| Stage | Surface | Notes |
| --- | --- | --- |
| Soft nav into `/pos` | `pos/loading.tsx` | Branded “TillFlow POS” card + full board wireframe |
| Page auth gate | Blocking `requireBusinessStore()` | May prolong previous loader |
| Suspense | `PosBoardSkeleton` | Second POS-shaped skeleton (no logo) |
| Progressive shell | Live catalog shell + `PosDeferredLoadingHint` | Third, lighter inline state |

### Stock / Inventory (`/inventory`)

| Stage | Surface |
| --- | --- |
| Soft nav | `CompactRouteLoading variant="inventory"` |

### Expenses (`/expenses`)

| Stage | Surface |
| --- | --- |
| Soft nav | Legacy inline pulse cards (not Compact) |

### Reports hub (`/reports`)

| Stage | Surface |
| --- | --- |
| Soft nav | `CompactRouteLoading variant="reports"` |
| Nested e.g. owner | Heavier / partially dark owner skeleton |
| Nested bodies | `ReportSectionSkeleton` |

### Fallback for protected routes **without** their own `loading.tsx`

Examples: `/account`, `/getting-started`, `/transfers`, many settings/report leaves.

| Stage | Surface |
| --- | --- |
| Soft nav | Nearest parent: often `ProtectedRouteLoading` via `app/(protected)/loading.tsx` |

### App open / auth entry

| Flow | Surfaces |
| --- | --- |
| PWA cold open | iOS startup image → `/launch` → `LaunchRedirector` sets flags → `router.replace('/onboarding')` → protected layout + home skeleton |
| Login (owner) | `redirect('/onboarding')` — **does not** go through `/launch` |
| Login (cashier/manager) | `redirect('/pos')` |
| Root `/` | Middleware → `/onboarding` (session) or `/welcome` (no session) |

---

## 3. Root cause: dark dashboard skeleton on checklist

**Cause:** `OwnerReadinessSkeleton` was designed for the **completed** owner control centre (comment: “Matches the control-centre shape…”, uses `bg-slate-900` hero). It is wired as:

1. `app/(protected)/onboarding/loading.tsx`
2. Suspense fallback on `onboarding/page.tsx`

**Branching** happens only **after** `OwnerReadinessContent` resolves `getOwnerHomeCriticalShell()`:

- `needsFullReadiness === true` → light `ReadinessJourney` checklist / “Ready to sell”
- else → dark `OwnerHomeCompletedStream`

So incomplete / new businesses always paint a **completed-home** skeleton first. That is a layout-shape mismatch, not an auth bug.

**Why it feels unstable:** dark → light flip + metric cards → checklist rows.

---

## 4. Root cause: POS pre-load flash

**Cause:** stacked loading layers on one navigation:

1. **`pos/loading.tsx`** — prominent TillFlow logo + “TillFlow POS” + large skeleton (reads as a mini splash)
2. **`PosBoardSkeleton`** — second full POS wireframe after the page module mounts
3. Optional **`PosDeferredLoadingHint`** — “Preparing checkout…” inside an already-visible shell

This matches the report: “brief extra loading/skeleton after the TillFlow-branded moment.” The branded moment is almost certainly **route `loading.tsx`**, not `/launch`, during Home → Sell.

**Not caused by:** reporting logic, sale creation, or auth rule changes.

---

## 5. Root cause: “random” TillFlow splash appearances

Multiple distinct triggers; not a single bug.

### 5A. Legitimate / intended (must preserve)

| Trigger | Mechanism |
| --- | --- |
| First app open / PWA resume from home screen | `manifest.start_url = "/launch"` → full launch page |
| SW precache includes `/launch` | Speeds cold launch HTML; does not rewrite in-app Link nav |
| Apple startup images | Native only |

`LaunchRedirector` **always** sets `tillflow:launching=1` and clears `launchSplashSeen` on every `/launch` visit — so **every PWA reopen** replays the launch ritual. Users may describe this as “during navigation” if they treat icon reopen as “still in the app.”

### 5B. Fullscreen branded splash without `/launch`

| Trigger | Mechanism |
| --- | --- |
| Root Instant Loading UI | `app/loading.tsx` → `RootLaunchLoading` → `AppLaunchLoading mode="launch" shell="fullscreen"` |
| Hard refresh / first paint of routes without a closer loader | Root loader can paint first |
| Soft navigation that suspends at root (leaving/entering route groups outside protected) | Same |

**Important:** root fullscreen splash is **not** gated by `tillflow:launching`. Session flags only affect personalisation / `shell="launch"` behaviour — not root visibility.

### 5C. Misclassified “splash” (branded route skeleton)

| Trigger | Mechanism |
| --- | --- |
| Home → Sell | `pos/loading.tsx` Logo + TillFlow copy |

### 5D. Ruled out / low likelihood as primary

| Hypothesis | Assessment |
| --- | --- |
| Auth refresh mid-nav showing `/launch` | Login redirects to `/onboarding` or `/pos`, not `/launch` |
| Middleware forcing `/launch` | Middleware lists `/launch` as public; does not redirect protected nav to it |
| Branch/till loading alone | Affects POS deferred data; shows inline hint, not full splash |
| Cached business identity mismatch | Affects launch **copy** only; does not mount splash |
| Pull-to-refresh | Remounts Suspense; route skeletons, not `/launch` (POS guarded when transaction active) |

---

## 6. Splash trigger matrix (investigation item 6)

| Trigger | Full launch splash? | Evidence |
| --- | --- | --- |
| Auth refresh | Unlikely | Redirects to home/POS |
| Business identity loading | No | Copy only |
| Branch/till loading | No | POS deferred hint |
| Route transition (protected→protected) | No full `/launch`; yes route skeletons; POS branded loader possible | Nested `loading.tsx` |
| PWA resume / icon open | **Yes** | `start_url: /launch` |
| Middleware redirect | Root `/` → onboarding/welcome; not `/launch` | `middleware.ts` |
| `loading.tsx` fallback | Root → fullscreen launch; protected → non-launch skeletons | File map above |
| Cached identity mismatch | No splash mount | `business-identity.ts` |

---

## 7. Reproduction status (Playwright / video)

### Attempted

- Local `PLAYWRIGHT_BASE_URL` default `http://localhost:6200` — **server not responding**
- `PLAYWRIGHT_OWNER_EMAIL` / password — **not set in this environment**
- Existing auth storage under `playwright/.auth/` is stale relative to a live run and was not used against production

### Code-path sequences (substitute evidence)

**A. New business checklist incomplete**

1. Enter `/onboarding`  
2. Frame: dark `OwnerReadinessSkeleton`  
3. Frame: light “Ready to sell” / checklist  

**B. Home → Sell**

1. `/onboarding` settled  
2. Navigate `/pos`  
3. Frame: branded `pos/loading.tsx`  
4. Frame: `PosBoardSkeleton`  
5. Frame: POS shell (+ optional deferred hint)  

**C. PWA / first open**

1. Native splash (iOS)  
2. `/launch` TillFlow  
3. `/onboarding` (+ dark skeleton if home)  

**D. Soft nav Inventory → Expenses**

1. Compact inventory skeleton  
2. Legacy expenses skeleton (style change)  

### Still needed before splash-gating changes

Capture video for:

- Fresh login (owner) — confirm **no** `/launch`  
- Icon reopen vs in-tab Home → Sell  
- Hard refresh on `/pos` and `/onboarding`  
- Incomplete checklist vs completed home  

---

## 8. Surface classification

| Surface | Class | Policy |
| --- | --- | --- |
| `/launch` + iOS startup images | App launch splash | Allowed only on app open / auth-entry launch path |
| `RootLaunchLoading` via `app/loading.tsx` | App launch splash | Should be limited to true cold/root entry — currently too broad |
| `ProtectedRouteLoading` | Route skeleton | Allowed; keep minimal |
| `CompactRouteLoading` / legacy light loaders | Route skeleton | Allowed; unify style |
| `OwnerReadinessSkeleton` on incomplete checklist | **Invalid flash** | Replace with checklist-shaped skeleton when `needsFullReadiness` unknown/true |
| Same skeleton on completed home | Route skeleton | Allowed if it matches final home |
| `pos/loading.tsx` branded chip | Borderline / **invalid flash** | Prefer POS-shaped shell **without** launch-like branding |
| `PosBoardSkeleton` | Route / page skeleton | Keep one POS skeleton, not two stacked |
| `PosDeferredLoadingHint` / home section skeletons | Inline panel | Allowed |
| Full `/launch` during Home→Sell | **Invalid flash** | Must not happen (confirm with video) |

---

## 9. Unified loading policy (proposed)

1. **First launch / PWA icon open:** OS frame → TillFlow `/launch` only → protected shell.  
2. **Protected shell loading:** Keep chrome (TopNav/tabs) when possible; content area uses calm non-branded skeleton.  
3. **Checklist loading:** Checklist-shaped skeleton (title + stage rows + primary CTA), light theme.  
4. **Completed Home loading:** Keep dark control-centre-shaped skeleton (or stream shell first).  
5. **POS loading:** Single POS-shaped skeleton **or** stable progressive POS shell; no Logo splash chip.  
6. **In-app navigation:** Never remount full `/launch` or root fullscreen `AppLaunchLoading`.  
7. **Launch flags:** Treat `tillflow:launching` as an explicit app-entry flag; root loader must not ignore it for fullscreen.

---

## 10. Recommended fix sequence

### Phase A — Layout-only (low risk, Conditional GO now)

1. Split onboarding skeletons:
   - `ChecklistReadinessSkeleton` for incomplete journey  
   - Keep / rename current dark skeleton for completed home  
2. Until shell is known, prefer **checklist-safe light skeleton** (incomplete is the painful case) **or** stream a shared neutral header first.  
3. POS: collapse to **one** skeleton — either thin `loading.tsx` that reuses `PosBoardSkeleton`, or remove route loader and rely on Suspense only. Strip Logo / “TillFlow POS” splash chip from route loading.  
4. Migrate `expenses` (and other focus routes) to `CompactRouteLoading` (or new variants) for mobile consistency.

### Phase B — Splash gating (needs video confirmation)

5. Gate `RootLaunchLoading` / root `loading.tsx` so fullscreen launch only paints when `tillflow:launching` is set **or** path is `/launch` / true cold entry.  
6. Consider `welcome`-style `loading.tsx = null` (or protected-minimal) for more public routes so they never inherit root launch.  
7. Optional: distinguish PWA cold start vs soft resume if product wants less launch replay (product decision — do not silently remove legitimate first launch).  
8. Remove duplicate `LaunchSessionCompletion` on POS page if layout mount is always sufficient (cleanup only).

### Phase C — Transition UX (optional)

9. Prefer preserving previous page until new route ready where Next.js allows (avoid blanking whole main).  
10. Centralise route skeletons under `components/loading/` with variants: `checklist | home | pos | list | reports | generic`.

### Explicit non-goals

- No business / reporting / accounting logic changes  
- No auth/session rule changes unless video proves a redirect bug  
- Do not remove legitimate first-launch splash or Apple startup images  

### Files likely to change (implementation later)

| Action | Files |
| --- | --- |
| Redesign / split | `OwnerReadinessSkeleton.tsx`, `onboarding/loading.tsx`, `onboarding/page.tsx` |
| Replace / thin | `pos/loading.tsx` |
| Align | `expenses/loading.tsx` (+ optionally products/customers/…) |
| Gate (Phase B) | `app/loading.tsx`, `RootLaunchLoading.tsx`, possibly `AppLaunchLoading.tsx` |
| Tests | new e2e + extend `lib/loading/route-skeletons.test.ts`, brand/cold-boot tests |

---

## 11. Risk assessment

| Risk | Level | Mitigation |
| --- | --- | --- |
| Checklist skeleton change regresses completed home CLS | Medium | Two skeletons or shell-first branch |
| POS loader removal flashes empty main | Medium | Keep one POS-shaped Suspense fallback |
| Over-gating root launch breaks cold boot personalisation | High | Preserve `/launch` path; add regression tests from cold-boot suite |
| Changing PWA `start_url` | High — out of scope unless product asks | Leave `"/launch"` |
| Auth/session edits | High | Not required for A-phase |
| False “fix” of splash that is actually POS branded loader | Medium | Classify in tests with DOM selectors (`TillFlow POS` vs `#tillflow-launch-message`) |

---

## 12. Tests needed

### Contract / unit (can land with Phase A)

- Onboarding loading source does **not** use dark `slate-900` checklist path (or uses dedicated checklist skeleton)  
- POS `loading.tsx` does not contain Logo / “TillFlow POS” launch chip  
- Expenses uses shared compact loader  
- Protected loading still excludes `AppLaunchLoading`  
- Root loading still uses launch UI for cold entry (Phase B adjusts gating assertions)

### Playwright / mobile screenshots (required before Phase B merge)

- [ ] No full launch splash (`/launch` DOM or `#tillflow-launch-message` / fullscreen launch copy) during Home → Sell  
- [ ] No full launch splash during Home → Stock  
- [ ] Checklist incomplete: intermediate skeleton matches checklist layout (no dark dashboard hero)  
- [ ] POS route does not flash unrelated dashboard (`ProtectedRouteLoading` / owner dark hero)  
- [ ] App refresh on protected route: acceptable launch **or** protected skeleton per policy (document expected)  
- [ ] Mobile screenshots: no wrong intermediate state for checklist and POS  
- [ ] Fresh login owner: lands onboarding without `/launch` unless product changes that  
- [ ] PWA `/launch` still personalises and hands off to protected shell  

---

## 13. Go / no-go

| Workstream | Recommendation |
| --- | --- |
| Checklist skeleton mismatch | **GO** (Phase A) |
| POS stacked / branded pre-load | **GO** (Phase A) |
| Compact vs legacy route skeleton drift | **GO** (Phase A, expenses first) |
| Root / launch splash gating | **NO-GO until** one confirmatory video identifies the in-app flash surface |
| Auth / middleware / reporting | **NO-GO** (not implicated) |

---

## Appendix A — Loading component checklist

- [x] `AppLaunchLoading`  
- [x] `RootLaunchLoading`  
- [x] `LaunchRedirector` / `app/launch/page.tsx`  
- [x] `LaunchSessionCompletion`  
- [x] `ProtectedRouteLoading`  
- [x] `CompactRouteLoading`  
- [x] `OwnerReadinessSkeleton`  
- [x] `PosBoardSkeleton` / `pos/loading.tsx` / `PosDeferredLoadingHint`  
- [x] `owner-home/skeletons`  
- [x] `ReportSectionSkeleton`  
- [x] `Skeleton.tsx`  
- [x] All `app/**/loading.tsx` under protected + root + welcome  
- [x] Apple splash assets + manifest `start_url`  

## Appendix B — Related existing tests

- `lib/loading/route-skeletons.test.ts`  
- `app/(protected)/loading.test.ts`  
- `lib/performance/cold-boot-handoff.test.ts`  
- `lib/branding/tillflow-brand.test.ts`  
- `lib/performance/owner-readiness-streaming.test.ts`  
- `tests/e2e/owner-cold-boot.spec.ts`  
- `tests/e2e/tap-to-sell-phase1-launch.spec.ts`  

---

## Appendix C — Verdict line (required)

**LOADING INVESTIGATION PARTIAL — more reproduction evidence needed before implementation.**
