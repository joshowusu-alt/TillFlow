-- Migration Framework P1 Slice 1: schema foundation only.
-- Additive: lineage, validation/approval evidence, storageStatus, actor Restrict FKs, limits-aligned CHECKs.
-- Does not implement upload/validation/approval/import services.

-- ---------------------------------------------------------------------------
-- 0) Preconditions: refuse unsafe NOT NULL upgrades (do not invent actor ids)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "MigrationPackage" WHERE "createdByUserId" IS NULL
  ) THEN
    RAISE EXCEPTION
      'P1 slice1 blocked: MigrationPackage.createdByUserId has NULL rows; cannot require creator without inventing actors';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) User tenant-safe composite uniqueness (actor FK target)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "User_businessId_id_key" ON "User"("businessId", "id");

-- ---------------------------------------------------------------------------
-- 2) MigrationPackage: additive columns (nullable first where backfill needed)
-- ---------------------------------------------------------------------------
ALTER TABLE "MigrationPackage" ADD COLUMN "approvalExpiresAt" TIMESTAMP(3);
ALTER TABLE "MigrationPackage" ADD COLUMN "lineageRootId" TEXT;
ALTER TABLE "MigrationPackage" ADD COLUMN "predecessorPackageId" TEXT;
ALTER TABLE "MigrationPackage" ADD COLUMN "latestValidationRunId" TEXT;
ALTER TABLE "MigrationPackage" ADD COLUMN "supersededByUserId" TEXT;
ALTER TABLE "MigrationPackage" ADD COLUMN "supersededAt" TIMESTAMP(3);

-- Root packages: lineageRootId = id (safe derivation, not invented identity)
UPDATE "MigrationPackage" SET "lineageRootId" = "id" WHERE "lineageRootId" IS NULL;
ALTER TABLE "MigrationPackage" ALTER COLUMN "lineageRootId" SET NOT NULL;

-- Require creator when no NULL rows remain (checked above)
ALTER TABLE "MigrationPackage" ALTER COLUMN "createdByUserId" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) Expand status CHECK with SUPERSEDED; add reconciliation invariant
-- ---------------------------------------------------------------------------
ALTER TABLE "MigrationPackage" DROP CONSTRAINT "MigrationPackage_status_check";
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_status_check" CHECK (
  "status" IN (
    'DRAFT',
    'VALIDATED',
    'APPROVED',
    'IMPORTING',
    'IMPORTED',
    'VALIDATION_FAILED',
    'APPROVAL_INVALIDATED',
    'IMPORT_FAILED',
    'EXPIRED',
    'CANCELLED',
    'SUPERSEDED'
  )
);

ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_recon_imported_only_check" CHECK (
  "status" = 'IMPORTED' OR "reconciliationStatus" = 'NOT_STARTED'
);

ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_predecessor_not_self_check" CHECK (
  "predecessorPackageId" IS NULL OR "predecessorPackageId" <> "id"
);

-- ---------------------------------------------------------------------------
-- 4) Replace actor FKs: drop SET NULL, add Restrict (+ composite where Prisma supports)
-- ---------------------------------------------------------------------------
ALTER TABLE "MigrationPackage" DROP CONSTRAINT "MigrationPackage_createdByUserId_fkey";
ALTER TABLE "MigrationPackage" DROP CONSTRAINT "MigrationPackage_validatedByUserId_fkey";
ALTER TABLE "MigrationPackage" DROP CONSTRAINT "MigrationPackage_approvedByUserId_fkey";
ALTER TABLE "MigrationPackage" DROP CONSTRAINT "MigrationPackage_executedByUserId_fkey";
ALTER TABLE "MigrationPackage" DROP CONSTRAINT "MigrationPackage_cancelledByUserId_fkey";

-- Required creator: composite same-business FK (Prisma-managed name)
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_businessId_createdByUserId_fkey"
  FOREIGN KEY ("businessId", "createdByUserId") REFERENCES "User"("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Optional actors: single-column Restrict (Prisma) + composite same-business (SQL-only)
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_validatedByUserId_fkey"
  FOREIGN KEY ("validatedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_businessId_validatedByUserId_fkey"
  FOREIGN KEY ("businessId", "validatedByUserId") REFERENCES "User"("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_businessId_approvedByUserId_fkey"
  FOREIGN KEY ("businessId", "approvedByUserId") REFERENCES "User"("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_executedByUserId_fkey"
  FOREIGN KEY ("executedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_businessId_executedByUserId_fkey"
  FOREIGN KEY ("businessId", "executedByUserId") REFERENCES "User"("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_cancelledByUserId_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_businessId_cancelledByUserId_fkey"
  FOREIGN KEY ("businessId", "cancelledByUserId") REFERENCES "User"("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_supersededByUserId_fkey"
  FOREIGN KEY ("supersededByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_businessId_supersededByUserId_fkey"
  FOREIGN KEY ("businessId", "supersededByUserId") REFERENCES "User"("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 5) Lineage: UNIQUE(predecessorPackageId); Prisma id FK + SQL composite tenant FK
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "MigrationPackage_predecessorPackageId_key"
  ON "MigrationPackage"("predecessorPackageId");

ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_predecessorPackageId_fkey"
  FOREIGN KEY ("predecessorPackageId") REFERENCES "MigrationPackage"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_businessId_predecessorPackageId_fkey"
  FOREIGN KEY ("businessId", "predecessorPackageId") REFERENCES "MigrationPackage"("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "MigrationPackage_businessId_lineageRootId_idx"
  ON "MigrationPackage"("businessId", "lineageRootId");

CREATE INDEX "MigrationPackage_businessId_status_approvalExpiresAt_idx"
  ON "MigrationPackage"("businessId", "status", "approvalExpiresAt");

CREATE UNIQUE INDEX "MigrationPackage_latestValidationRunId_key"
  ON "MigrationPackage"("latestValidationRunId");

-- ---------------------------------------------------------------------------
-- 6) MigrationValidationRun (create before latestValidationRun FK)
-- ---------------------------------------------------------------------------
CREATE TABLE "MigrationValidationRun" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "manifestChecksum" TEXT NOT NULL,
    "resultDigest" TEXT,
    "summaryJson" TEXT,
    "exceptionCount" INTEGER NOT NULL DEFAULT 0,
    "exceptionsTruncated" INTEGER NOT NULL DEFAULT 0,
    "validatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "MigrationValidationRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MigrationValidationRun_status_check" CHECK (
      "status" IN ('SUCCESS', 'FAILED', 'STALE')
    )
);

CREATE UNIQUE INDEX "MigrationValidationRun_businessId_id_key"
  ON "MigrationValidationRun"("businessId", "id");
CREATE INDEX "MigrationValidationRun_businessId_packageId_createdAt_idx"
  ON "MigrationValidationRun"("businessId", "packageId", "createdAt");
CREATE INDEX "MigrationValidationRun_packageId_createdAt_idx"
  ON "MigrationValidationRun"("packageId", "createdAt");

ALTER TABLE "MigrationValidationRun" ADD CONSTRAINT "MigrationValidationRun_businessId_packageId_fkey"
  FOREIGN KEY ("businessId", "packageId") REFERENCES "MigrationPackage"("businessId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MigrationValidationRun" ADD CONSTRAINT "MigrationValidationRun_validatedByUserId_fkey"
  FOREIGN KEY ("validatedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MigrationValidationRun" ADD CONSTRAINT "MigrationValidationRun_businessId_validatedByUserId_fkey"
  FOREIGN KEY ("businessId", "validatedByUserId") REFERENCES "User"("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- latestValidationRun pointer (nullable; SetNull on run delete)
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_latestValidationRunId_fkey"
  FOREIGN KEY ("latestValidationRunId") REFERENCES "MigrationValidationRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 7) MigrationApprovalHistory (immutable; Restrict package + composite approver)
-- ---------------------------------------------------------------------------
CREATE TABLE "MigrationApprovalHistory" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "approvedManifestChecksum" TEXT NOT NULL,
    "approvalExpiresAt" TIMESTAMP(3) NOT NULL,
    "validationRunId" TEXT,
    "validationResultDigest" TEXT,
    "contractVersion" TEXT NOT NULL,
    "reportingCurrency" TEXT NOT NULL,
    "packageAsOfDate" TEXT NOT NULL,
    "branchMappingDigest" TEXT,
    "fileChecksumsJson" TEXT NOT NULL,
    "acknowledgementJson" TEXT,
    "note" TEXT,
    "snapshotJson" TEXT,
    "invalidatedAt" TIMESTAMP(3),
    "invalidationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MigrationApprovalHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MigrationApprovalHistory_businessId_id_key"
  ON "MigrationApprovalHistory"("businessId", "id");
CREATE INDEX "MigrationApprovalHistory_businessId_packageId_approvedAt_idx"
  ON "MigrationApprovalHistory"("businessId", "packageId", "approvedAt");
CREATE INDEX "MigrationApprovalHistory_packageId_approvedAt_idx"
  ON "MigrationApprovalHistory"("packageId", "approvedAt");

ALTER TABLE "MigrationApprovalHistory" ADD CONSTRAINT "MigrationApprovalHistory_businessId_packageId_fkey"
  FOREIGN KEY ("businessId", "packageId") REFERENCES "MigrationPackage"("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MigrationApprovalHistory" ADD CONSTRAINT "MigrationApprovalHistory_businessId_approverUserId_fkey"
  FOREIGN KEY ("businessId", "approverUserId") REFERENCES "User"("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 8) MigrationFile.storageStatus
-- ---------------------------------------------------------------------------
ALTER TABLE "MigrationFile" ADD COLUMN "storageStatus" TEXT NOT NULL DEFAULT 'PENDING';

ALTER TABLE "MigrationFile" ADD CONSTRAINT "MigrationFile_storageStatus_check" CHECK (
  "storageStatus" IN ('PENDING', 'FINALISED', 'FAILED')
);

CREATE INDEX "MigrationFile_businessId_storageStatus_idx"
  ON "MigrationFile"("businessId", "storageStatus");
