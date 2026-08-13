# Step 6K — Business Movement period clarity deployment

## 1. Verdict

**BUSINESS MOVEMENT PERIOD CLARITY DEPLOY PASSED — period clarity is live.**

## 2. Scope confirmation

| Check | Result |
| --- | --- |
| Feature branch | `polish/business-movement-period-clarity` |
| Feature commit | `177ebb8df3b1ee1c0ae6e51ae7066ee6c8e84ed3` |
| Feature PR | [#95](https://github.com/joshowusu-alt/TillFlow/pull/95) → merge `b97d76d0c0230c16daaaa05b93b099c8dce08f05` |
| Prisma / migrations | **None** |
| Period bound logic (`periods.ts`) | **Unchanged** |
| Money Received aggregation | **Unchanged** |
| Insight ranking rules | **Unchanged** (`insight-engine.ts` not in diff) |
| Calculations / ChangePairs | **Unchanged** |
| AI advice | **Not added** |
| Stock causation / days out of stock | **Not claimed** |
| Export completeness | **COMPLETE_STREAM preserved** |

### Files shipped (feature)

- `app/(protected)/reports/business-movement/page.tsx`
- `lib/reports/business-movement/owner-copy.ts`
- `lib/reports/business-movement/owner-copy.test.ts`
- `lib/reports/business-movement/export.ts`
- `lib/reports/business-movement/index.ts`
- `lib/reports/business-movement/business-movement-ui.test.ts`
- `docs/reporting/STEP_6J_BUSINESS_MOVEMENT_PERIOD_CLARITY.md`
- `scripts/business-movement-preview-validate.cjs`
- `scripts/business-movement-production-smoke.cjs`

## 3. Hosted preview

| Field | Value |
| --- | --- |
| Preview SHA | `177ebb8df3b1ee1c0ae6e51ae7066ee6c8e84ed3` |
| Vercel | `dpl_urxWuE7d8EAZwRBTAXzFezrr7ych` Ready Preview |
| URL | https://supermarket-kas3311f9-joshua-owusus-projects.vercel.app |
| Alias | https://supermarket-pos-git-polish-busine-c3b20b-joshua-owusus-projects.vercel.app |
| Probe | `scripts/business-movement-preview-validate.cjs` → **PASSED** |
| Log | `tmp/step6k-preview-validate.log` (local) |

Preview checks:

- `/reports/business-movement` renders
- Top line shows `Comparing: [current label] vs [comparison label]`
- Exact ISO audit line remains visible
- Summary strip names periods (`July sales… compared with June`)
- Headline cards use `vs June 2026` (or the relevant comparison label)
- Insight cards do not show `comparison period`
- Product mover qty uses `in June` / relevant label, not `last period`
- Export includes period labels, original date keys, and `COMPLETE_STREAM`
- Owner/Manager allowed; Cashier denied
- No forbidden stock-causation language
- Money Received + MoMo still load
- Branch + tenant scoping hold

## 4. Local / CI gates

```
npx vitest run lib/reports/business-movement → 48 passed
npx tsc --noEmit → 0
npx eslint (touched files) → 0
npx next build → 0 (tmp/step6k-next-build.log)

PR #95 CI: lint, typecheck, unit, build, pos-safety, Vercel — all pass
```

## 5. Production deploy

| Field | Value |
| --- | --- |
| Live production SHA | `b97d76d0c0230c16daaaa05b93b099c8dce08f05` (merge of #95) |
| Feature commit included | `177ebb8df3b1ee1c0ae6e51ae7066ee6c8e84ed3` |
| Vercel production | `dpl_H2HnSTDJJvhetnRHjdHyXsDneomw` Ready |
| Deployment URL | https://supermarket-jry0stz5e-joshua-owusus-projects.vercel.app |
| Live aliases | https://www.tillflow.app , https://tillflow.app |
| Migrations run on Production | **None** |

Custom domains were pointed with `vercel alias set` after the Production deployment became Ready.

## 6. Production smoke (read-only)

Probe: `scripts/business-movement-production-smoke.cjs`  
Log: `tmp/step6k-production-smoke.log`  
Credentials: existing QA tenant — **no synthetic inserts**.

The first pass failed because live QA totals were unchanged, so the summary used “about the same as June” rather than “compared with June”. The probe was relaxed to accept named-period wording for unchanged/empty movement. Product copy was not changed. Re-run passed.

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

Period-clarity assertions on production:

- `Comparing:` line present
- Exact date audit line present
- Summary names the current period
- Headline cards use `vs [named comparison]`
- No owner-facing `last period` / `comparison period`
- Export has `currentPeriodLabel`, `comparisonPeriodLabel`, `comparingLine`, original date keys, `COMPLETE_STREAM`

## 7. Confirmations

- No production migrations
- No production data mutation (preview seed cleaned up; production smoke read-only)
- No AI advice
- Calculations, period bound logic, Money Received logic, and ranking rules preserved
- Export completeness `COMPLETE_STREAM` preserved
- Stock limitation wording preserved in Data note:
  > Historical stock availability is not yet reliable. This report does not attribute sales movement to stock-outs or inventory gaps.

## 8. Routes checked

- `/reports/business-movement`
- `/exports/business-movement`
- `/reports/money-received`
- `/reports/momo-confirmation`
- `/reports/dashboard?period=today`
- `/reports/weekly-digest`
- `/` (today/home)
