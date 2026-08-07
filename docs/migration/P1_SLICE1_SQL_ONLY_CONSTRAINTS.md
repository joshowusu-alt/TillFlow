# P1 Slice 1 — intentional SQL-only constraints

**Status:** Locked for Migration Framework P1 Slice 1  
**Applies after:** `20260806170000_migration_framework_p1_slice1_schema`  
**Ownership correction:** `20260806183000_migration_p1_slice1_latest_run_ownership`

## Why SQL-only exists

Prisma cannot express **optional composite foreign keys** that share a required
scalar (for example `businessId`) already used by another required relation.
P1 therefore keeps:

- the strongest representable Prisma relations (single-column `RESTRICT`, or
  required composites such as `createdBy` / approval `approver`); and
- additional **SQL-only** composite foreign keys for tenant and package
  ownership that Prisma schema-diff does not model.

These SQL-only constraints are **intentional**. A Prisma-generated migration
that proposes dropping them must **not** be accepted. Any legitimate replacement
must update, together:

1. the database invariant / migration SQL;
2. the live `pg_constraint` introspection guard
   (`scripts/migration-p1-sql-only-constraint-contract.cjs`);
3. the behavioural PostgreSQL suite
   (`scripts/migration-p1-schema-pg-test.cjs`).

## Migration-safety classification (P1 Slice 1)

Do **not** describe the Slice 1 work as “additive only”. Accurate classes:

| Class | What happened |
|---|---|
| Additive schema objects | New columns/tables/indexes (`lineageRootId`, validation/approval evidence, `storageStatus`, …) |
| Lineage backfill | `lineageRootId = id` for existing package rows |
| Nullability strengthening | `createdByUserId` guarded then `SET NOT NULL`; `lineageRootId` `NOT NULL` |
| Constraint strengthening | Actor/approver `ON DELETE RESTRICT`; reconciliation CHECK; latest-run ownership FKs |
| Constraint replacement | Status CHECK drop/recreate (add `SUPERSEDED`); actor FKs `SET NULL` → `RESTRICT` |

No table rebuild, no migration-evidence deletion, and no invented actor identity
backfill. If any `createdByUserId` were NULL, migration `20260806170000` fails
closed before strengthening.

## Protected SQL-only inventory

Live definitions are asserted after `prisma migrate deploy` by
`scripts/migration-p1-sql-only-constraint-contract.cjs`.

| Constraint | Table | Columns → referenced | ON DELETE |
|---|---|---|---|
| `MigrationPackage_businessId_predecessorPackageId_fkey` | MigrationPackage | `(businessId, predecessorPackageId)` → `MigrationPackage(businessId, id)` | RESTRICT |
| `MigrationPackage_businessId_validatedByUserId_fkey` | MigrationPackage | `(businessId, validatedByUserId)` → `User(businessId, id)` | RESTRICT |
| `MigrationPackage_businessId_approvedByUserId_fkey` | MigrationPackage | `(businessId, approvedByUserId)` → `User(businessId, id)` | RESTRICT |
| `MigrationPackage_businessId_executedByUserId_fkey` | MigrationPackage | `(businessId, executedByUserId)` → `User(businessId, id)` | RESTRICT |
| `MigrationPackage_businessId_cancelledByUserId_fkey` | MigrationPackage | `(businessId, cancelledByUserId)` → `User(businessId, id)` | RESTRICT |
| `MigrationPackage_businessId_supersededByUserId_fkey` | MigrationPackage | `(businessId, supersededByUserId)` → `User(businessId, id)` | RESTRICT |
| `MigrationValidationRun_businessId_validatedByUserId_fkey` | MigrationValidationRun | `(businessId, validatedByUserId)` → `User(businessId, id)` | RESTRICT |
| `MigrationPackage_businessId_latestValidationRunId_fkey` | MigrationPackage | `(businessId, latestValidationRunId)` → `MigrationValidationRun(businessId, id)` | RESTRICT |
| `MigrationPackage_latestValidationRunId_id_fkey` | MigrationPackage | `(latestValidationRunId, id)` → `MigrationValidationRun(id, packageId)` | RESTRICT |

## latestValidationRun ownership invariant

When `latestValidationRunId` is not null:

```
package.businessId = run.businessId
AND package.id = run.packageId
```

NULL `latestValidationRunId` remains permitted (MATCH SIMPLE). Historical runs
stay rows on `MigrationValidationRun`; only the package pointer moves.
