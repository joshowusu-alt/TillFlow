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

### Application upload transport (hardened)

Vercel Functions reject request bodies above **4.5 MiB**. Next.js server actions in this repo are further capped at `bodySizeLimit: '4mb'`. Therefore **file bytes must not transit the Next.js/Vercel function body**.

Approved transport:

1. Authenticated `prepareMigrationClientUpload` / `POST /api/migration/files/prepare-upload` issues a **short-lived client upload token** minted with `MIGRATION_BLOB_READ_WRITE_TOKEN` (RW token never returned).
2. Client uploads directly to the private migration store (`access: 'private'`) to the **server-owned pathname**, with `maximumSizeInBytes = 25 MiB`.
3. Authenticated `finaliseMigrationUploadedObject` / `POST /api/migration/files/finalise` verifies `head`, streams a bounded SHA-256, enforces file policy, then finalises in a short DB transaction.

Base64-in-action upload is **retired** and rejected before decode.

## Upload / finalisation sequence

1. AuthZ + same-business mutable package + **mandatory** `expectedVersion`
2. Prepare client token (no file bytes on server)
3. Client private Blob put (≤25 MiB)
4. Server `head` + bounded stream checksum + CSV/text/archive policy
5. Short DB transaction: lock package, CAS version, upsert `MigrationFile` as `FINALISED`
6. Fail-closed audit (client-safe error mapping)
7. On DB/CAS/policy failure after upload: **retain** the newly prepared object (no synchronous Blob delete)

`MigrationFile` is inserted only when `uploadChecksum` is known (hash-before-insert).

### Deletion invariant (TOCTOU / referenced-object protection)

**Never delete a Blob on a failure path when a concurrent finalisation could establish (or has established) a `MigrationFile` reference.**

Slice 2A chooses **Option B — disable synchronous failure-path Blob deletion**:

- A DB reference count followed by an external Blob delete is a classic check/use race and is **not** race-safe.
- “Immediately before deletion” does **not** close that race.
- Separate PostgreSQL connections do **not** make an external Blob delete atomic with reference creation.
- There is no existing schema-backed lease or shared advisory-lock convention covering both reference creators and Blob I/O outside short DB transactions.

Therefore:

- Failure-path and unused-prepared-upload cleanup **never** call `storage.delete`.
- Failed / unused prepared uploads are deliberately retained under the `mig/` prefix.
- Bounded operational orphans are preferable to a successful DB record referencing a missing object.
- Automatic orphan collection is deferred to separately authorised lifecycle coordination.
- Prepared-upload token verification and server-owned pathnames remain mandatory for finalise; a raw client pathname alone is never deletion authority (and runtime deletion is disabled regardless).
- Previous successfully referenced objects follow the retention policy (not deleted on replacement in Slice 2A).

## Concurrency

- Material mutations **require** `expectedVersion` (positive integer) at every callable boundary
- Omission / malformed / stale values fail closed
- Adapters must not silently refresh version for the client
- Short transactions + `SELECT … FOR UPDATE` + unique constraints
- Exact idempotent replay remains distinct from stale conflicting mutation

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
- Material mutations require `expectedVersion` and follow demotion

## Download

Authenticated Owner/Manager only; same-business file ownership; stream via server using migration token; safe `Content-Disposition` filename; no public URL exposure.

## Client errors

Clients receive stable public codes/messages only. Raw database, Blob, SDK, constraint names, tokens and stack details never cross the boundary.

## Deployment

No Prisma schema or migration files. Merge would deploy runtime code only (schema already live). Slice 2A PR must not be merged under this authorisation.

## Orphans

Failure-path and unused prepared uploads are **retained** (Option B). Synchronous automatic Blob deletion is disabled because count-then-delete cannot close the TOCTOU race against concurrent `MigrationFile` reference creation without schema-backed coordination. Objects abandoned by process kill or deferred cleanup remain identifiable by the `mig/` key prefix for a later bounded operational task (no worker here).
