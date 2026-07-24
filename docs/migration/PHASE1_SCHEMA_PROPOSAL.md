# Phase 1 migration framework — schema proposal (revised)

**Status:** Awaiting approval before Preview/production `prisma migrate deploy`.  
**Branch:** `migration-framework-phase1`  
**Baseline master SHA:** `65328242add2d47ec75666f38796df05a200db2f`  
**Migration file:** `prisma/migrations/20260724120000_migration_framework_phase1/migration.sql`  
**Edit decision:** Migration never applied — unapplied SQL was revised in place (no conflicting history).

## Exact need

Hardened foundation for source-namespaced, tenant-safe, checksum-bound, chunk-atomic migration of catalogue + suppliers + branch opening stock (equity only).

## Models

### `MigrationBatch`

| Column | Notes |
| --- | --- |
| `sourceSystemKey` | Stable normalized namespace; immutable after create; CHECK regex |
| `sourceSystemLabel` | Optional display only |
| `fileChecksum` | SHA-256 hex of bytes; immutable after create |
| `approvedFileChecksum` | Set on approve; commit must match |
| `status` | Lifecycle CHECK |
| `reconciliationStatus` | Separate from import completion CHECK |
| `@@unique([businessId, id])` | Tenant-aware composite target for children |
| `@@unique([businessId, clientBatchKey])` | Batch idempotency |

### `MigrationEntityMap`

| Column | Notes |
| --- | --- |
| `sourceSystemKey` | Denormalised for independent lookup |
| `migrationBatchId` | **Required** |
| Composite FK | `(businessId, migrationBatchId) → MigrationBatch(businessId, id)` |
| Unique | `(businessId, sourceSystemKey, entityType, sourceReference)` |
| `targetId` | Polymorphic — **no FK** |

### `MigrationChunkReceipt`

| Column | Notes |
| --- | --- |
| `businessId` | Explicit tenant scope |
| Composite FK | Same tenant-aware pattern |
| Unique | `(businessId, migrationBatchId, phase, chunkIndex)` |
| Created only | Inside the same TX as successful business writes (IMPORT) |

### `MigrationOpeningStockPosting`

Row-level durable claim for equity opening stock.

| Unique | Purpose |
| --- | --- |
| `(businessId, migrationBatchId, storeId, productId)` | One post per product/store/batch |
| `(businessId, referenceId)` | Stable StockMovement/journal reference |

## `sourceSystemKey` rules

| Rule | Behaviour |
| --- | --- |
| Format | `^[a-z0-9][a-z0-9_-]{1,62}$` (2–63 chars) |
| Normalisation | Trim + lowercase before store/compare |
| Case | Insignificant (normalised) |
| Max length | 63 |
| Absent key | Rejected — no default namespace |
| After create | Immutable (including after validation/approval) |
| Same file, different namespace | Allowed as a **new** batch (`clientBatchKey` + `sourceSystemKey`); maps are independent |
| Same legacy ref, other tenant | Isolated by `businessId` |
| Same legacy ref, two namespaces, one tenant | Allowed — two maps |
| Label | Display only; never identity |

Minimal design chosen over a separate `MigrationSource` table: denormalised `sourceSystemKey` on batch/maps/postings avoids an extra join for Phase 1 uniqueness/lookup. A future `MigrationSource` model can be introduced if multi-batch source metadata grows.

## Tenant relationship matrix

| Relation | DB enforcement |
| --- | --- |
| EntityMap / ChunkReceipt / OpeningPosting → Batch | **DB** composite FK `(businessId, migrationBatchId)` |
| Batch / maps / receipts → Business | **DB** FK + Cascade on tenant wipe |
| Batch → User (uploaded/approved/reconciled) | **DB** SetNull |
| EntityMap.targetId → Product/Supplier/Category | **App only** (polymorphic); tenant checked on resolve |
| Opening stock → Store/Branch | **App** (lookup scoped by `businessId`) |
| StockMovement | Existing model; migration adds `MigrationOpeningStockPosting` claim |

## Lifecycle / types

String columns + SQL CHECK (repo convention — no Prisma enums elsewhere). Transitions enforced in `lib/migration/lifecycle.ts`.

## File identity

Server SHA-256 of content. Validate/approve/import all require matching checksum. Changed content cannot reuse `clientBatchKey`. Filename is not identity.

## Chunk atomicity

IMPORT: business writes + `MigrationChunkReceipt.create` in one `$transaction`. Concurrent second attempt hits unique receipt → duplicate/no double effect. Failure rolls back writes and receipt together.

## Opening-stock idempotency

`MigrationOpeningStockPosting` unique claim **before** inventory write; `recordOpeningInventory` joins caller TX. Equity path only — no cash/MoMo/AP/AR/sales.

## Reconciliation

Separate `reconciliationStatus`: `NOT_STARTED | PENDING | MATCHED | MISMATCHED | ACCEPTED`. Import `COMPLETED` ≠ reconciled. Owner may `ACCEPTED` a mismatch with explicit flag. Acceptance immutable. No rollback claim.

## Deletion / retention

- User delete → SetNull on batch actor fields (audit preserved)
- Business delete → Cascade migration tables (tenant wipe)
- Product/supplier delete → maps remain; next use reports `MAPPED_TARGET_MISSING` (no silent recreate)
- JSON caps: 5 MiB file, 50k rows, 2000 exceptions, 500k JSON chars
- Operator retention guidance: 90 days for upload artefacts

## Approval gate

Reply **approve Phase 1 schema** before any Preview `migrate deploy`.
