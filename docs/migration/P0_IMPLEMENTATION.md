# Migration Framework P0 — Implementation notes

## Baseline

- Branch: `feat/migration-framework-p0`
- Created from: `origin/master` @ `baadf1052a06dc8da3603a22b766c79c4b53406c`
- Historic branch tip excluded (including unrelated POS commit on `migration-framework-phase1`)

## Historic provenance (selective adaptation)

| Source | Reused concept | Adaptation |
|---|---|---|
| `0f6a917` `checksum.ts` | SHA-256 hex | Unchanged idea; package manifest added |
| `0f6a917` `lifecycle.ts` | Fail-closed transitions | New status vocabulary; recon separated |
| `0f6a917` `limits.ts` | Size limits + CSV sanitize | Added 14-day expiry helpers |
| `0f6a917` `source-system-key.ts` | Namespace normalisation | Uses `MigrationContractError` (no Next/prisma) |
| `0f6a917` `contract.ts` | Field specs / headers | PRODUCTS (not CATALOGUE); decimal money; prohibited fields |
| `0f6a917` schema patterns | Tenant composite unique + FKs | Package/File/BranchMapping (not Batch) |

**Not reused:** `batch-service.ts`, `commit.ts`, upload UI, import actions, historic `MigrationBatch` model, Preview rehearsal scripts.

## What P0 does **not** include

- Upload / validation / approval UI
- Import execution or accounting posting
- Preview/Production `prisma migrate deploy`
- Prospect data handling
- Dual-control workflow

## Role policy lock

| Role | Access |
|---|---|
| Cashier | Denied |
| Manager | Upload/inspect/validate (future wiring) |
| Owner | Final approval |

## Checksums

- File identity = SHA-256 of exact uploaded bytes
- Parsing normalisation ≠ file identity
- Package manifest checksum = SHA-256 of canonical JSON (fixed key order; sorted files and mappings)

## Expiry / retention

- Unapproved packages: expire 14 days after creation (`expiresAt` immutable on file replace)
- Approved / importing / imported: not expired by 14-day rule
- File retention recommendation: 90 days after terminal status; retain checksums/audit forever (subject to business erasure)

## Cleanup (future)

A scheduled job may:

1. Transition expiry-eligible packages with `now >= expiresAt` → `EXPIRED`
2. After retention window, delete blob/storage objects while retaining DB checksum/audit rows

Not implemented in P0.
