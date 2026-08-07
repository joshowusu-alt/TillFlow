# Migration P1 Slice 2A — locked contract

**Status:** Locked for implementation  
**Baseline:** `9df6d8c5eb2254e72814420af1a74a5be1977c26`  
**Schema change:** None authorised

## Scope

Includes:

- Phase 1 package creation in `DRAFT`
- Private staged CSV upload and finalisation (`SUPPLIERS`, `PRODUCTS`, `OPENING_STOCK`)
- Intentional file replacement while pre-approval mutable
- Branch-mapping create / update / delete
- Lifecycle demotion after material mutation
- Fail-closed audit evidence
- Sealed services + thin authenticated adapters
- Authorised private download streaming

Excludes:

- Validation execution / findings / validation-run creation
- Approval, supersession, cancellation
- Import, stock posting, supplier/product creation
- Reconciliation, background workers, UI

## Actors

| Role | Access |
|---|---|
| `OWNER` | Permitted |
| `MANAGER` | Permitted |
| `CASHIER` | Denied |
| Unauthenticated | Denied |

Actor identity and `businessId` come **only** from the authenticated server session.

## Tenant isolation

- Every read/write is scoped to session `businessId`
- Package, file, and store targets must belong to that business
- Cross-tenant requests fail closed without revealing existence
- Client-supplied actor, tenant, lifecycle status, storage key, URL, or checksum are never trusted as authority

## Package creation

- Status forced to `DRAFT`
- `createdByUserId` = session user
- `lineageRootId` = new package `id` (root packages)
- `expiresAt` = `computePackageExpiresAt(createdAt)` (14-day unapproved clock)
- Optional `clientPackageKey`: unique per business
  - identical immutable replay → return existing
  - conflicting immutable input → conflict
  - concurrent identical creates → one row (unique + re-read)

Immutable create fields: `contractVersion`, `sourceSystemKey`, `sourceBusinessKey`, `reportingCurrency`, `packageAsOfDate`.

## Private storage

| Environment | Store | Credential |
|---|---|---|
| Production | `tillflow-migration-production` (`store_wwVWsFfc2wAfYvtA`) | `MIGRATION_BLOB_READ_WRITE_TOKEN` |
| Preview | `tillflow-migration-preview` (`store_Ty26j8NMr32MPgf9`) | `MIGRATION_BLOB_READ_WRITE_TOKEN` |
| Development | None | Fail closed / test fake only |

Rules:

- Pass the migration token **explicitly** to every Blob SDK call
- Upload with `access: 'private'`
- Never fall back to `BLOB_READ_WRITE_TOKEN` or `tillflow-assets`
- Never log raw CSV bytes or secrets
- Keys: `mig/{businessId}/{packageId}/{uploadId}/{entityType}.csv` (server-owned, unique)

## Upload / finalisation sequence

1. AuthZ + same-business mutable package
2. Enforce ≤25 MiB; CSV/text allowlist; reject archives
3. Server-side SHA-256 of exact bytes
4. Upload private object (outside DB transaction)
5. `head` metadata verification
6. Short DB transaction: lock package, CAS version, upsert `MigrationFile` as `FINALISED`
7. Fail-closed audit
8. On DB failure after upload: best-effort delete of the new object only

`MigrationFile` is inserted only when `uploadChecksum` is known (hash-before-insert).

## Replay and replacement

- Exact replay (same package, entity, checksum): return existing; no duplicate effect
- Conflicting replay (same entity intent, different checksum without replace flag): conflict
- Replacement: new unique object key; atomic DB pointer swap; never in-place overwrite; previous object retained for retention (no GC worker in Slice 2A)

## Pre-approval mutation

Mutable statuses: `DRAFT`, `VALIDATED`, `VALIDATION_FAILED` (`isPreApprovalMutableStatus`).

Material mutation on `VALIDATED` / `VALIDATION_FAILED` (or when `latestValidationRunId` is set):

- demote to `DRAFT`
- clear `latestValidationRunId`
- mark prior run `supersededAt` (row retained)
- clear file `validationChecksum` / `validatedAt` on package files
- increment `version`
- audit

Historical validation runs are never deleted. No new validation results are created.

## Branch mappings

- Same-business package and `Store`
- Canonical source branch key
- Unique `(packageId, sourceBranchKey)` and `(packageId, targetStoreId)`
- Material mutations follow the demotion rule above

## Concurrency

- Short transactions
- `SELECT … FOR UPDATE` on package rows
- Version compare-and-set
- Existing unique constraints
- Fail-closed audit (transaction aborts on audit failure)

## Download

Authenticated Owner/Manager only; same-business file ownership; stream via server using migration token; safe `Content-Disposition` filename; no public URL exposure.

## Deployment

No Prisma schema or migration files. Merge would deploy runtime code only (schema already live). Slice 2A PR must not be merged under this authorisation.

## Orphans

Best-effort delete of newly uploaded objects after finalisation failure. Objects abandoned by process kill remain identifiable by `mig/` key prefix for a later operational task (no worker here).
