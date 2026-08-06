-- P1 Slice 1 correction: tenant-safe + package-safe latestValidationRunId.
--
-- Classification: constraint strengthening / constraint replacement (not "additive only").
-- Does not rewrite 20260806170000 (already applied on Preview for PR #81).
-- Production never received 20260806170000 before this correction branch.
--
-- Invariant enforced:
--   package.businessId = run.businessId
--   AND package.id = run.packageId
-- when latestValidationRunId IS NOT NULL.
--
-- ON DELETE RESTRICT blocks deleting a currently selected validation run.
-- DEFERRABLE INITIALLY DEFERRED allows package CASCADE delete of its runs at
-- transaction end (package row gone → pointer check passes) while still
-- rejecting a standalone DELETE of a selected run.

-- 1) Replace weak single-column SET NULL pointer with Restrict
ALTER TABLE "MigrationPackage" DROP CONSTRAINT IF EXISTS "MigrationPackage_latestValidationRunId_fkey";

-- 2) Unique target for same-package ownership FK
CREATE UNIQUE INDEX "MigrationValidationRun_id_packageId_key"
  ON "MigrationValidationRun"("id", "packageId");

-- 3) Prisma-managed single-column pointer (Restrict)
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_latestValidationRunId_fkey"
  FOREIGN KEY ("latestValidationRunId") REFERENCES "MigrationValidationRun"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4) Same-business ownership (SQL-only composite; see docs/migration/P1_SLICE1_SQL_ONLY_CONSTRAINTS.md)
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_businessId_latestValidationRunId_fkey"
  FOREIGN KEY ("businessId", "latestValidationRunId")
  REFERENCES "MigrationValidationRun"("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- 5) Same-package ownership: selecting package.id must equal run.packageId
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_latestValidationRunId_id_fkey"
  FOREIGN KEY ("latestValidationRunId", "id")
  REFERENCES "MigrationValidationRun"("id", "packageId")
  ON DELETE RESTRICT ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;
