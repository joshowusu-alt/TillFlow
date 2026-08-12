# Step 5N — MoMo Confirmation Review deployment

## 1. Verdict

**MOMO CONFIRMATION DEPLOY PASSED — read-only review is live.**

## 2. Scope confirmation

| Check | Result |
| --- | --- |
| Feature branch | `feature/momo-confirmation-review` |
| Feature commit | `46c247535a29a6411bd29a38bcf5e11cbae97e51` |
| Feature PR | [#88](https://github.com/joshowusu-alt/TillFlow/pull/88) → merge `a505bf470ff889d9c6a5519f34ee3ab3c050a532` |
| Hotfix (card always links) | `hotfix/momo-confirmation-card-link` / [#89](https://github.com/joshowusu-alt/TillFlow/pull/89) → merge `9ab1de078cbe1bf565e804621e87efb4871fb2db` |
| Prisma / migrations | **None** |
| Money Received `compute` / aggregation | **Unchanged** |
| Verify / approve / auto-confirm | **Not added** |
| Step 6 | **Not started** |

### Files shipped (feature + hotfix)

Runtime / product:

- `app/(protected)/reports/momo-confirmation/page.tsx`
- `app/(protected)/exports/momo-confirmation/route.ts`
- `lib/reports/momo-confirmation/**`
- `app/(protected)/reports/money-received/page.tsx` (copy + always-linked Needs MoMo confirmation card)
- `app/(protected)/reports/page.tsx`
- `lib/navigation-config.ts`
- `lib/reports/money-received/display.ts`
- `lib/reports/money-received/quality.ts`

Tests / probes / docs:

- `lib/reports/momo-confirmation/momo-confirmation.test.ts`
- `lib/reports/money-received/money-received-*.test.ts` (copy/link expectations)
- `lib/reports/reports-index-polish.test.ts`
- `scripts/momo-confirmation-preview-validate.cjs`
- `scripts/momo-confirmation-production-smoke.cjs`
- `docs/reporting/STEP_5M_MOMO_CONFIRMATION_REVIEW_REPORT.md`
- `docs/reporting/STEP_5N_MOMO_CONFIRMATION_REVIEW_DEPLOYMENT.md`

## 3. Hosted preview

| Field | Value |
| --- | --- |
| Preview SHA | `46c247535a29a6411bd29a38bcf5e11cbae97e51` |
| Vercel | `dpl_9dPwduZ9LyZtv9NyifA3oirtKThK` Ready Preview |
| URL | https://supermarket-2ldcykif7-joshua-owusus-projects.vercel.app |
| Alias | https://supermarket-pos-git-feature-momo-79bfef-joshua-owusus-projects.vercel.app |
| Probe | `scripts/momo-confirmation-preview-validate.cjs` → **PASSED** |
| Log | `tmp/step5n-preview-validate.log` (local) |

Preview checks:

- `/reports/momo-confirmation` renders with `PENDING_MANUAL`
- `/exports/momo-confirmation` returns `COMPLETE_STREAM` (scoped; no branch leak)
- Money Received shows **Needs MoMo confirmation** + review link; pending txn excluded from Money Received table
- Branch scoping Store A vs Store B
- Owner/Manager allowed; Cashier denied (page + export)

## 4. Local / CI gates (feature)

```
npx vitest run lib/reports/momo-confirmation lib/reports/money-received …
 Tests  64 passed | 18 skipped

npx tsc --noEmit   (exit 0)
npx eslint …       (exit 0)
npx next build     (exit 0)

PR #88 CI: lint, typecheck, unit, build, pos-safety, Vercel — all pass
```

## 5. Production deploy

| Field | Value |
| --- | --- |
| Live production SHA | `9ab1de078cbe1bf565e804621e87efb4871fb2db` (includes #88 + #89) |
| Feature merge SHA | `a505bf470ff889d9c6a5519f34ee3ab3c050a532` |
| Hotfix merge SHA | `9ab1de078cbe1bf565e804621e87efb4871fb2db` |
| Vercel production | `dpl_BD2wt7JFobcnvfHeEGaVZcCXAdrA` Ready |
| Deployment URL | https://supermarket-g8g3jc2yu-joshua-owusus-projects.vercel.app |
| Live aliases | https://www.tillflow.app , https://tillflow.app |
| Migrations run on Production | **None** |

### Alias note

After merge, Vercel created a Ready Production deployment that did not automatically move custom domains. Domains were pointed with `vercel alias set` / promote so tillflow.app serves the merge SHA before smoke.

### Hotfix note

Initial production smoke after #88 failed Money Received link check because the **Review MoMo confirmations** link lived only inside the quality warning banner (hidden when QA tenant had zero unverified in range). Hotfix #89 wraps the **Needs MoMo confirmation** StatCard in a permanent link.

## 6. Production smoke (read-only)

Probe: `scripts/momo-confirmation-production-smoke.cjs`  
Log: `tmp/step5n-production-smoke.log`  
Credentials: existing QA tenant (`.playwright-qa.local.env`) — **no synthetic inserts**.

```
PASS owner /reports/momo-confirmation
PASS owner MoMo export COMPLETE_STREAM
PASS Money Received link/card/copy
PASS trading dashboard
PASS weekly digest
PASS owner home / today surface
PASS manager access + export
PASS cashier denial
MOMO CONFIRMATION PRODUCTION SMOKE PASSED
```

| Check | Result |
| --- | --- |
| MoMo Confirmation page | **PASS** |
| MoMo export `COMPLETE_STREAM` | **PASS** |
| Money Received link/card/copy | **PASS** |
| Owner/Manager access | **PASS** |
| Cashier denial | **PASS** |
| Dashboard / today / weekly | **PASS** |

## 7. Accounting contract preserved

- CONFIRMED receipts still count in Money Received
- Parent RETURNED/VOID does not exclude confirmed receipts
- SalesReturn refunds remain separate `refund_outflows`
- Sale-amend negative `SalesPayment` rows remain inside Money Received
- `PENDING_MANUAL` remains excluded from Money Received until CONFIRMED
- No verify/approve/exclude actions; no auto-confirm

## 8. Safety confirmation

- No production Prisma migration executed
- No production data mutation (preview probe used tagged Preview DB rows only, then cleaned up)
- Money Received aggregation logic unchanged
- Step 6 not started

## 9. Final verdict

**MOMO CONFIRMATION DEPLOY PASSED — read-only review is live.**
