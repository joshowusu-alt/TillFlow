# Step 5Q — Manual MoMo confirmation deployment

## 1. Verdict

**MOMO MANUAL CONFIRMATION DEPLOY PASSED — confirmation workflow is live.**

## 2. Scope confirmation

| Check | Result |
| --- | --- |
| Feature branch | `feature/momo-manual-confirmation` |
| Feature commit | `a8341ab6f62681a9ad90d3b5afbd96b5c1294525` |
| Feature PR | [#97](https://github.com/joshowusu-alt/TillFlow/pull/97) → merge `205c34468e973f7e487aaf458c9b3e9f3416f807` |
| Prisma / migrations | **None** — no `prisma/` files in the change set; no production migration ran |
| Money Received `compute.ts` / `query.ts` inclusion | **Unchanged** — not in the diff |
| Auto-confirm / bulk / reject / duplicate | **Not added** |
| Invoice / GL / cash drawer writes | **Not in confirm path** |
| `receivedAt` / `receiptOrigin` | **Preserved** |

### Files shipped (feature)

Runtime / product:

- `app/actions/momo-confirmation.ts` — `confirmMomoPaymentAction` (Owner/Manager)
- `lib/services/momo-confirmation.ts` — transactional status update + `AuditLog`
- `app/(protected)/reports/momo-confirmation/MomoConfirmDrawer.tsx`
- `app/(protected)/reports/momo-confirmation/page.tsx`
- `lib/reports/momo-confirmation/query.ts`
- `lib/reports/momo-confirmation/types.ts`
- `lib/audit.ts` — `MOMO_PAYMENT_CONFIRM`
- `app/(protected)/reports/audit-log/page.tsx` — “MoMo Payment Confirmed”

Tests / probes / docs:

- `lib/services/momo-confirmation.test.ts`
- `lib/reports/momo-confirmation/momo-confirmation.test.ts`
- `scripts/momo-manual-confirm-preview-validate.cjs`
- `scripts/momo-manual-confirm-production-smoke.cjs`
- `docs/reporting/STEP_5O_MOMO_MANUAL_CONFIRMATION_INVESTIGATION.md`
- `docs/reporting/STEP_5P_MOMO_MANUAL_CONFIRMATION_WORKFLOW.md`
- `docs/reporting/STEP_5Q_MOMO_MANUAL_CONFIRMATION_DEPLOYMENT.md`

Not in the change set: `prisma/**`, `lib/reports/money-received/compute.ts`, `lib/reports/money-received/query.ts`.

## 3. Hosted preview

| Field | Value |
| --- | --- |
| Preview SHA | `a8341ab6f62681a9ad90d3b5afbd96b5c1294525` |
| Vercel | `dpl_CxsRsameuXCougxzYWtx566iBm32` Ready Preview |
| URL | https://supermarket-5u8c1i7ao-joshua-owusus-projects.vercel.app |
| Alias | https://supermarket-pos-git-feature-momo-fe59ea-joshua-owusus-projects.vercel.app |
| Probe | `scripts/momo-manual-confirm-preview-validate.cjs` → **PASSED** |
| Log | `tmp/step5q-preview-validate.log` (local) |

Preview used tagged Preview-DB rows only, then cleaned up.

Preview checks (all **PASS**):

- Owner can open Review drawer
- Manager can open Review drawer
- Cashier denied
- Reference required
- Note required
- Confirming `PENDING_MANUAL` → `CONFIRMED`
- `AuditLog` row created with `MOMO_PAYMENT_CONFIRM`
- Confirmed row left MoMo Confirmation Review
- Money Received includes it using original `receivedAt`
- `receivedAt` unchanged
- `receiptOrigin` unchanged
- Invoice status unchanged
- GL / cash drawer untouched
- `RETURNED` parent sale blocked
- Already `CONFIRMED` is idempotent with no duplicate audit

Preview payment lifecycle evidence:

| Field | Value |
| --- | --- |
| Payment id | `cf90104c728589b623b04c309` |
| Status after | `CONFIRMED` |
| `receivedAt` | `2026-08-13T12:00:00.000Z` (unchanged) |
| `receiptOrigin` | `RECEIVED_AT_SALE` (unchanged) |
| Invoice status | `PAID` (unchanged) |
| Audit id | `cmsrgw7p60006con2yxzcem25` |
| Audit action | `MOMO_PAYMENT_CONFIRM` |

## 4. Local / CI gates

```
npx vitest run lib/services/momo-confirmation.test.ts lib/reports/momo-confirmation lib/reports/money-received
 Tests  73 passed | 18 skipped

npx tsc --noEmit -p tsconfig.json  → exit 0
npx eslint <touched paths>         → exit 0
npx next build                     → exit 0

PR #97 CI: lint, typecheck, unit, build, pos-safety, Vercel — all pass
```

## 5. Production deploy

| Field | Value |
| --- | --- |
| Live production SHA | `205c34468e973f7e487aaf458c9b3e9f3416f807` (merge of #97) |
| Feature commit included | `a8341ab6f62681a9ad90d3b5afbd96b5c1294525` |
| Vercel production | `dpl_2yYq8yDYj3hJ33xKi2hRaRxmNnQe` Ready |
| Deployment URL | https://supermarket-2ib1433l4-joshua-owusus-projects.vercel.app |
| Live aliases | https://www.tillflow.app , https://tillflow.app |
| Migrations run on Production | **None** |

### Alias note

After merge, Vercel created a Ready Production deployment that did not automatically move custom domains. Domains were pointed with `vercel alias set` so tillflow.app / www.tillflow.app serve `dpl_2yYq8yDYj3hJ33xKi2hRaRxmNnQe` before smoke.

## 6. Production smoke (controlled QA tenant only)

Probe: `scripts/momo-manual-confirm-production-smoke.cjs`  
Log: `tmp/step5q-production-smoke.log`  
Credentials: QA tenant (`.playwright-qa.local.env`)  
Guard: owner `businessId` must be in `TILLFLOW_INTERNAL_QA_BUSINESS_IDS`  
Writes: one tagged QA `PENDING_MANUAL` payment + one tagged `RETURNED` parent row; both deleted after smoke (including related `AuditLog`)

No real merchant payments were confirmed. No production migration ran.

```
PASS owner /reports/momo-confirmation
PASS owner confirmed QA PENDING_MANUAL
PASS AuditLog + lifecycle preserved
PASS MoMo review list updated
PASS Money Received includes confirmed QA payment
PASS RETURNED parent blocked
PASS business movement
PASS trading dashboard
PASS weekly digest
PASS owner home / today surface
PASS manager access
PASS cashier denial
MOMO MANUAL CONFIRMATION PRODUCTION SMOKE PASSED
```

Production payment lifecycle evidence:

| Field | Value |
| --- | --- |
| QA business id | `cmr2h7pna55f22d2288316407` |
| Payment id | `ce70de0f3f5cadedab57e6b78` |
| Status after | `CONFIRMED` |
| Audit id | `cmsrh6wnd00022lg57x3fn6lf` |
| Audit action | `MOMO_PAYMENT_CONFIRM` |
| Tag | `MOMO_5Q_PROD_1786622952959_6cf1` (deleted after smoke) |

Smoke also verified:

- `receivedAt` unchanged vs pre-confirm snapshot
- `receiptOrigin` unchanged
- Invoice `paymentStatus` remained `PAID`
- `JournalEntry` count for the QA sale unchanged
- `CashDrawerEntry` count for the QA sale unchanged
- Confirmed txn left `/reports/momo-confirmation`
- Money Received for the original day included the confirmed amount
- Owner/Manager access; Cashier denied
- Already-confirmed QA payment had a single `MOMO_PAYMENT_CONFIRM` audit
- `/reports/business-movement`, `/reports/dashboard?period=today`, `/reports/weekly-digest`, and owner home loaded without error

## 7. Routes / actions deployed

- `/reports/momo-confirmation` — Review drawer + Confirm MoMo payment
- `confirmMomoPaymentAction` (`app/actions/momo-confirmation.ts`)
- `/reports/audit-log` — `MOMO_PAYMENT_CONFIRM` label
- `/reports/money-received` — unchanged inclusion; confirmed rows appear on original `receivedAt`
- `/exports/momo-confirmation` — unchanged export of remaining `PENDING_MANUAL` rows
- `/reports/business-movement`, `/reports/dashboard?period=today`, `/reports/weekly-digest`, `/` — no regression in smoke

## 8. Accounting contract preserved

- Confirmation is a reporting gate only: `SalesPayment.status` `PENDING_MANUAL` → `CONFIRMED`
- Money Received still includes only `status === CONFIRMED`, keyed by original `receivedAt`
- Confirming a payment does **not** move it to “today”
- Parent `RETURNED` / `VOID` still blocks confirm
- Invoice `paymentStatus` is not rewritten
- No GL / journal postings
- No cash-drawer or shift-close writes
- `receivedAt` and `receiptOrigin` are not updated
- No auto-confirm, bulk confirm, reject, or duplicate workflow

## 9. Safety confirmation

- No production Prisma migration executed
- Production write smoke limited to `TILLFLOW_INTERNAL_QA_BUSINESS_IDS`
- Tagged QA rows and their `AuditLog` rows were deleted after smoke
- Money Received aggregation / inclusion logic unchanged
- Invoice / GL / cash drawer untouched by the confirm path
- Step 6 expansion not started

## 10. Final verdict

**MOMO MANUAL CONFIRMATION DEPLOY PASSED — confirmation workflow is live.**
