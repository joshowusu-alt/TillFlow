# Step 5M — MoMo Confirmation Review report (read-only)

## 1. Verdict

**MOMO CONFIRMATION REVIEW READY — ready for preview/deploy.**

## 2. Objective result

Built a read-only Owner/Manager report for payments that need Mobile Money confirmation (`PENDING_MANUAL` / non-classified statuses). Money Received aggregation and inclusion rules were **not** changed.

## 3. Routes added / changed

| Path | Change |
| --- | --- |
| `app/(protected)/reports/momo-confirmation/page.tsx` | **Add** — read-only review UI |
| `app/(protected)/exports/momo-confirmation/route.ts` | **Add** — scoped complete CSV export |
| `lib/reports/momo-confirmation/**` | **Add** — query/export/types/tests |
| `app/(protected)/reports/money-received/page.tsx` | Copy rename + deep link to review |
| `lib/reports/money-received/quality.ts` | Owner-facing warning text |
| `lib/reports/money-received/display.ts` | Row kind label rename |
| `lib/navigation-config.ts` | Nav: MoMo Confirmation |
| `app/(protected)/reports/page.tsx` | Hub card |
| `lib/reports/reports-index-polish.test.ts` | Allow `/reports/momo-confirmation` |

## 4. Owner-facing copy changes

| Before | After |
| --- | --- |
| Unverified legacy (stat / drill) | **Needs MoMo confirmation** |
| Unverified legacy receipts (drill option) | **Needs MoMo confirmation** |
| Quality banner about “unverified legacy receipts” | MoMo still needs confirmation (`PENDING_MANUAL`), excluded from Money Received |
| — | Link: **Review MoMo confirmations** → `/reports/momo-confirmation` |

Internal metric id remains `unverified_legacy_receipts` (contract unchanged).

## 5. Table / filter / export behaviour

### Report `/reports/momo-confirmation`

Columns: When, Branch, Cashier, Sale #, Customer, Method, Status, Sale status, Amount.

Filters:

- Date range (default last 30 days)
- Branch
- Payment status (`PENDING_MANUAL` default, or all needing confirmation)
- Sale status
- Cashier

Summary cards: count, total amount, default status label.

**No** verify/approve/exclude buttons.

### Export `/exports/momo-confirmation`

- Owner/Manager only (shared export gate)
- Business + branch scoped
- Streams all matching rows
- `X-Export-Completeness: COMPLETE_STREAM`
- Meta note: not included in Money Received until CONFIRMED

## 6. Access control

| Role | Page | Export |
| --- | --- | --- |
| Owner | Allowed | Allowed |
| Manager | Allowed | Allowed |
| Cashier | Denied (`requireBusiness` / `resolveMoneyReceivedAccess`) | Denied (`requireExportUser`) |

Tenant/branch scoping uses the same trusted access helper as Money Received.

## 7. Money Received logic unchanged

Confirmed:

- No edits to `compute.ts` inclusion predicates
- `PENDING_MANUAL` remains outside classified statuses → still excluded from `money_received`
- Same `CLASSIFIED_PAYMENT_STATUSES` / `isUnverifiedLegacyStatus` contract
- Review report **reads** the same non-classified set; it does not promote rows

## 8. Tests / validation

```
npx vitest run lib/reports/momo-confirmation lib/reports/money-received lib/reports/reports-index-polish.test.ts
 Test Files  8 passed | 4 skipped
      Tests  64 passed | 18 skipped

npx tsc --noEmit
(exit 0)

npx eslint <touched paths>
(exit 0)

npx next build
(exit 0 — routes include /reports/momo-confirmation and /exports/momo-confirmation)
```

Focused coverage:

- `PENDING_MANUAL` appears in MoMo confirmation query
- `PENDING_MANUAL` remains unverified / excluded from Money Received classification
- Owner/Manager allowed; Cashier denied
- Export COMPLETE_STREAM + business/branch scoping
- Surface wiring (page/export/nav/Money Received link)

## 9. Preview / deploy recommendation

Safe to take through hosted preview then production as a **read-only UX** release (no migrations, no data mutation, no aggregation change).

Suggested sequence:

1. Commit on `feature/momo-confirmation-review`
2. PR → Preview validation (Owner list, export, Cashier denial, Money Received link)
3. Production deploy when instructed

## 10. Safety confirmation

- No production data mutation occurred
- No production migration occurred
- Money Received contract was preserved
- Step 6 was not started

## 11. Final verdict

**MOMO CONFIRMATION REVIEW READY — ready for preview/deploy.**
