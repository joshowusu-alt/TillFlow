# Migration Framework P0 — Schema

## Models implemented

### `MigrationPackage`

Atomic package. Holds contract metadata, lifecycle status, reconciliation status, manifest checksums, expiry, and actor audit fields (`createdBy`, `validatedBy`, `approvedBy`, `executedBy`, `cancelledBy`).

Critical constraints:

- `@@unique([businessId, id])` — tenant composite parent
- `@@unique([businessId, clientPackageKey])` — optional idempotent create
- indexes on `(businessId, status, createdAt)` and `(businessId, status, expiresAt)`

### `MigrationFile`

One logical file belonging to a package. Entity type ∈ `SUPPLIERS | PRODUCTS | OPENING_STOCK`
(CHECK-constrained in SQL).

`@@unique([packageId, entityType])` guarantees **at most one** file of each entity type
within a package. It does **not** guarantee that all three Phase 1 types exist.

P1 validation and approval must **transactionally** require exactly:

- one `SUPPLIERS` file;
- one `PRODUCTS` file;
- one `OPENING_STOCK` file;

before a package may become `VALIDATED` or `APPROVED`. Passing uniqueness alone is not package completeness.

Checksum fields: `uploadChecksum`, `validationChecksum`, `approvedChecksum`.

Tenant safety: composite FK `(businessId, packageId) → MigrationPackage(businessId, id)`.

### `MigrationBranchMapping`

Maps `sourceBranchKey` → `targetStoreId`.

Tenant safety: composite FK `(businessId, targetStoreId) → Store(businessId, id)` with `ON DELETE RESTRICT`.

Uniqueness: one source branch key per package; one target store per package.

### `Store` additive constraint

`@@unique([businessId, id])` enables the composite FK above. Globally unique `id` already implied this; the compound unique makes tenant membership expressible in SQL.

## Deferred models (not in P0)

See `P0_FUTURE_MODELS.md` for:

- `MigrationEntityMap`
- `MigrationImportAttempt` / chunk receipts
- `MigrationOpeningStockPosting`
- `MigrationException`
- reconciliation result persistence

## Cascade / retention behaviour

| Relation | onDelete |
|---|---|
| Package → Business | Cascade (business erasure policy) |
| File / mapping → Package | Cascade |
| Mapping → Store | Restrict |
| Actor User FKs | SetNull (retain audit ids cleared only if user removed; checksums/manifest remain) |

## Protections not expressible in Prisma alone

| Protection | Enforcement |
|---|---|
| Actor belongs to same business as package | Service transaction (`assertSameBusinessActor`) |
| Required source branches from opening-stock file are all mapped | Service validation before VALIDATED/APPROVED |
| Manifest matches approved checksums before import | Service (`assertApprovalEvidenceIntact`) — P2 |
| Expiry transition DRAFT→EXPIRED | Server job / request gate (P1+) using `expiresAt` |

## Migration SQL

`prisma/migrations/20260806130000_migration_framework_p0/migration.sql`

**Not applied** to Preview or Production under P0 authorisation.
