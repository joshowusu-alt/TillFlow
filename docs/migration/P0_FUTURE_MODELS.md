# Migration Framework — Future models (post-P0)

These models are designed but **not** implemented in P0 because they depend on unfinished import semantics.

## `MigrationEntityMap` (P1/P2)

Purpose: deterministic source → target identity across retries and successor packages.

Proposed uniqueness:

```
@@unique([businessId, sourceSystemKey, entityType, sourceReference])
```

Entity types: `SUPPLIER | PRODUCT | CATEGORY` (extend later).

`targetId` is polymorphic (no FK). Deleted targets are detected at import/reconcile time and reported as `MAPPED_TARGET_MISSING` — mappings must not silently retarget.

Deferral reason: without import writes, maps would be empty scaffolding and risk incorrect cascade/attempt semantics.

## `MigrationImportAttempt` + `MigrationChunkReceipt` (P2)

Purpose: resumable chunked import with concurrency control.

Proposed receipt uniqueness:

```
@@unique([businessId, packageId, attemptId, phase, chunkIndex])
```

Successful chunk receipts remain valid if a later chunk fails; package is not `IMPORTED` until all chunks and finalisation succeed.

## `MigrationOpeningStockPosting` (P2)

Purpose: idempotent claim for opening-stock quantity + equity posting.

Proposed uniqueness:

```
@@unique([businessId, packageId, storeId, productId])
@@unique([businessId, referenceId])
```

Must participate in the same DB transaction as inventory and journal writes.

## `MigrationException` (P1+)

Purpose: structured, export-safe exception rows (batch/package, entity, source row, code, severity, resolution).

Prefer a dedicated table over unbounded JSON once validation UI lands.

## Reconciliation results (P3)

Persist expected vs actual control totals separately from package lifecycle. `MATCHED` is earned, never manually selected as an import status.
