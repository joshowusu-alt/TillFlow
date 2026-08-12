# Step 6G — Business Movement deployment

## 1. Verdict

**BUSINESS MOVEMENT DEPLOY PASSED — deterministic insight report is live.**

## 2. Scope confirmation

| Check | Result |
| --- | --- |
| Feature branch | `feature/business-movement-report` |
| Feature commit | `88a6a990936f33114f7c4cb2a1f5414f7b3e3256` |
| Feature PR | [#91](https://github.com/joshowusu-alt/TillFlow/pull/91) → merge `38ae81f85f82ae9ef9398f45295696b8f1d8bea2` |
| Prisma / migrations | **None** |
| Money Received aggregation (`lib/reports/money-received/**`) | **Unchanged** |
| Insight ranking rules | **Unchanged** for deploy (UI/export only consumes 6D) |
| AI advice | **Not added** |
| Stock causation / days out of stock | **Not claimed** |

### Files shipped (feature)

Runtime / product:

- `lib/reports/business-movement/**` (6B–6D engine + 6F export)
- `app/(protected)/reports/business-movement/page.tsx`
- `app/(protected)/exports/business-movement/route.ts`
- `app/(protected)/reports/page.tsx` (hub card)
- `lib/navigation-config.ts`
- `lib/reports/reports-index-polish.test.ts`

Docs / probes:

- `docs/reporting/STEP_6A` … `STEP_6F`
- `scripts/business-movement-preview-validate.cjs`
- `scripts/business-movement-production-smoke.cjs`
- `docs/reporting/STEP_6G_BUSINESS_MOVEMENT_DEPLOYMENT.md`

## 3. Hosted preview

| Field | Value |
| --- | --- |
| Preview SHA | `88a6a990936f33114f7c4cb2a1f5414f7b3e3256` |
| Vercel | `dpl_4Y855dxSWNp2xZ2ypN8CSS8RiRuQ` Ready Preview |
| URL | https://supermarket-f8xm7d4zv-joshua-owusus-projects.vercel.app |
| Alias | https://supermarket-pos-git-feature-busin-136329-joshua-owusus-projects.vercel.app |
| Probe | `scripts/business-movement-preview-validate.cjs` → **PASSED** |
| Log | `tmp/step6g-preview-validate.log` (local) |

Preview checks:

- `/reports/business-movement` renders for Owner (Fact / Evidence / Signal / Recommended check)
- Headline cards: Sales, Money Received, Refunds, Needs MoMo, Sales vs MR gap
- Product / branch / cashier tables present
- Stock disclaimer present; no forbidden stock-causation language
- `/exports/business-movement` returns `COMPLETE_STREAM`
- Owner/Manager allowed; Cashier denied
- Branch + tenant scoping holds
- Money Received + MoMo Confirmation still load
- Money Received / MoMo links on BM page work

## 4. Local / CI gates (feature)

```
npx vitest run lib/reports/business-movement lib/reports/reports-index-polish.test.ts
→ 46 passed

PR #91 CI: lint, typecheck, unit, build, pos-safety, Vercel — all pass
```

## 5. Production deploy

| Field | Value |
| --- | --- |
| Live production SHA | `38ae81f85f82ae9ef9398f45295696b8f1d8bea2` (merge of #91) |
| Feature commit included | `88a6a990936f33114f7c4cb2a1f5414f7b3e3256` |
| Vercel production | `dpl_2zFhfgoy8tGGk6ZnkLPMrYZP2gUo` Ready |
| Deployment URL | https://supermarket-exbb711i0-joshua-owusus-projects.vercel.app |
| Live aliases | https://www.tillflow.app , https://tillflow.app |
| Migrations run on Production | **None** |

### Alias note

After merge, Vercel created a Ready Production deployment that did not automatically move custom domains. Domains were pointed with `vercel alias set` so tillflow.app / www.tillflow.app serve the merge SHA before smoke.

## 6. Production smoke (read-only)

Probe: `scripts/business-movement-production-smoke.cjs`  
Log: `tmp/step6g-production-smoke.log`  
Credentials: existing QA tenant (`.playwright-qa.local.env`) — **no synthetic inserts**.

```
PASS owner /reports/business-movement
PASS owner BM export COMPLETE_STREAM
PASS Money Received still loads
PASS MoMo Confirmation still loads
PASS trading dashboard
PASS weekly digest
PASS owner home / today surface
PASS manager access + export
PASS cashier denial
BUSINESS MOVEMENT PRODUCTION SMOKE PASSED
```

| Check | Result |
| --- | --- |
| BM page | Pass |
| BM export COMPLETE_STREAM | Pass |
| Owner / Manager | Pass |
| Cashier denial | Pass |
| Money Received / MoMo regression | Pass |
| Dashboard / weekly / home | Pass |
| Stock disclaimer preserved | Pass (page copy verified) |

## 7. Confirmations

- No production migrations
- No production data mutation (preview seed cleaned up; production smoke read-only)
- No AI advice
- Money Received logic preserved
- Stock limitation wording preserved:
  > Historical stock availability is not yet reliable. This report does not attribute sales movement to stock-outs or inventory gaps.

## 8. Routes deployed

- `/reports/business-movement`
- `/exports/business-movement`

## 9. Follow-ups (non-blocking)

- Optional: Step 6E stock weak-signal layer (still gated NOT_RELIABLE)
- Smoke probe denial helper hardened locally against false positives from `insufficient_data` insight copy / billing banners (commit with this deployment doc)
