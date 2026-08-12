# Step 5I — Canonical Money Received production deployment

## 1. Pre-merge confirmation

| Field | Value |
| --- | --- |
| Integration branch | `integration/money-received-canonical-5e` |
| Target branch | `master` |
| `origin/master` before merge | `1a573a09cac8d4b38768060ce82d30e1c824b33f` (unchanged since Step 5H) |
| Production SHA before merge | `1a573a09cac8d4b38768060ce82d30e1c824b33f` |
| Validated hosted-preview tip | `06baf155d948eb36286d99bf93055e0ebf3d98ec` |
| Prisma migration required | **No** (no `prisma/**` in merge; CI `migrate status` on ephemeral PG passed) |

## 2. Merge

| Field | Value |
| --- | --- |
| PR | https://github.com/joshowusu-alt/TillFlow/pull/86 |
| Merge method | Merge commit (preserves lineage) |
| Merged at | 2026-08-12T10:28:55Z |
| Merge commit on `master` | `b9361077285b9520a7d1e6a3a0ac7b39f5936d1b` |

### Commit lineage merged

```
b9361077 Merge pull request #86 from joshowusu-alt/integration/money-received-canonical-5e
113d5c24 fix(reports): allow Canonical Money Received hub route in reports index polish test
9f21500b fix(reports): avoid false-positive RETURNED exclusion check in PG scale test
06baf155 docs(reports): add Step 5F Money Received commit and hosted preview prep
1b85e964 feat(reports): reconcile canonical Money Received on integration branch
```

### CI gate repair (test-only; no runtime behaviour change)

Before merge, PR CI failed on:

1. Postgres smoke source assertion matching documentation comments mentioning `paymentStatus` / `RETURNED` → fixed in `9f21500b`.
2. Reports hub allowlist missing `/reports/money-received` → fixed in `113d5c24`.

After those fixes: lint, typecheck, unit, build, pos-safety, migrate-status, and Vercel Preview all **passed**. Hosted Preview contract on `06baf155` remained the runtime validation baseline; CI repairs were assertion/allowlist only.

## 3. Production deployment

| Field | Value |
| --- | --- |
| Production deployment SHA | `b9361077285b9520a7d1e6a3a0ac7b39f5936d1b` |
| GitHub Production deployment id | `5867570070` |
| Vercel deployment | `dpl_5XUMFxuEkF5aqMKcox5MoU5EqxRc` |
| Status | Ready |
| Deployment URL | https://supermarket-el795apy3-joshua-owusus-projects.vercel.app |
| Production aliases | https://tillflow.app , https://www.tillflow.app |
| Environment | **Production** |
| Migrations run on Production | **None** |

## 4. Production smoke (read-only)

Probe: `scripts/money-received-production-smoke.cjs`  
Log: `tmp/step5i-production-smoke.log`  
Credentials: existing QA tenant (`.playwright-qa.local.env`) — password verify passed against Production DB; **no synthetic inserts**.

```
PASS owner /reports/money-received
PASS owner export COMPLETE_STREAM
PASS invalid store scoping
PASS trading dashboard
PASS weekly digest
PASS owner home / today surface
PASS manager access + export
PASS cashier denial
PASS tenant isolation probe
PRODUCTION SMOKE PASSED
```

| Check | Result |
| --- | --- |
| Owner `/reports/money-received` | **PASS** — title + non-sales framing |
| Manager access | **PASS** — page + export |
| Cashier denial | **PASS** — page denied; export not `COMPLETE_STREAM` |
| `/exports/money-received` | **PASS** — Owner/Manager `COMPLETE_STREAM`, no `PARTIAL_EXPORT_CAP` |
| Tenant isolation probe | **PASS** — foreign `businessId` does not broaden export scope |
| Branch / store scoping | **PASS** — invalid `storeId` scoped/denied; branch controls present (full A/B synthetic isolation previously proven in Step 5G Preview) |
| Dashboard / today / weekly | **PASS** — Trading Dashboard shows Money received; weekly digest + owner home load without server errors |

## 5. Production logs

- Vercel production build output includes `ƒ /reports/money-received` and `ƒ /exports/money-received`.
- Live `vercel logs` stream during post-deploy observation did not surface money-received/export 5xx in the captured window (CLI is streaming-oriented; historical query limited).
- Smoke responses themselves: Owner/Manager export HTTP 200 complete stream; no HTML error pages on report surfaces.

## 6. Defects found

| Defect | Severity | Resolution |
| --- | --- | --- |
| CI PG scale source assertion false-positive on docs comments | CI blocker | Fixed `9f21500b` before merge |
| Hub polish allowlist omitted `/reports/money-received` | CI blocker | Fixed `113d5c24` before merge |
| Production smoke initially used Preview bypass secret | Local probe issue | Removed Preview bypass from Production smoke; re-ran successfully |

No production runtime defects requiring rollback.

## 7. Rollback status

**Not required.** Rollback candidate remains prior Production SHA `1a573a09cac8d4b38768060ce82d30e1c824b33f` via Vercel instant rollback if needed later.

## 8. Safety confirmation

- No production Prisma migration executed
- No production data mutation beyond normal application deployment
- Step 6 not started
- Reporting scope not broadened beyond Canonical Money Received

## 9. Final verdict

**PRODUCTION DEPLOY PASSED — Canonical Money Received is live.**
