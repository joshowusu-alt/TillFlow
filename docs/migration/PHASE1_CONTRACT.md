# TillFlow migration contract v1.0.0 (Phase 1) — revised

Source-neutral destination format. Transform any external export **before** upload.

## Lifecycle (import)

```text
UPLOADED → VALIDATING → VALIDATION_FAILED | READY_FOR_APPROVAL
→ APPROVED → IMPORTING → COMPLETED | COMPLETED_WITH_EXCEPTIONS | FAILED
```

## Reconciliation (separate)

```text
NOT_STARTED → PENDING → MATCHED | MISMATCHED → ACCEPTED
```

Import completion is **not** reconciliation success. UI must show both statuses.

## Source namespace

`sourceSystemKey` (required, normalized, immutable per batch) namespaces entity maps:

`@@unique([businessId, sourceSystemKey, entityType, sourceReference])`

`sourceSystemLabel` is display-only.

## File identity

Server SHA-256 (`fileChecksum`). Approval freezes `approvedFileChecksum`. Commit rejects mismatches.

## Templates

1. **CATALOGUE** — flat categories, products, primary barcode, sell/cost, preferred supplier legacy id  
2. **SUPPLIERS** — supplier master  
3. **OPENING_STOCK** — branch qty via `branchCode`; equity opening only  

## Non-goals

Historical sales/purchases/movements, alternate barcodes, customers/debtors, supplier payables, cash/MoMo, cashiers, loyalty, vendor-named schema fields.

## Idempotency

- Batch: `(businessId, clientBatchKey)` + checksum match  
- Chunks: `(businessId, migrationBatchId, phase, chunkIndex)` receipt in same TX as writes  
- Entities: source-namespaced map  
- Opening stock: `MigrationOpeningStockPosting` unique per batch/store/product  

## Limits

See `lib/migration/limits.ts` (5 MiB / 50k rows / 2000 exceptions retained).
