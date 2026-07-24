-- Phase 1 reusable migration framework (source-neutral) — revised schema.
-- Unapplied; editing in place is acceptable (never deployed to Preview/production).
-- Do not deploy until explicit schema approval.

CREATE TABLE "MigrationBatch" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "templateKind" TEXT NOT NULL,
    "contractVersion" TEXT NOT NULL,
    "sourceSystemKey" TEXT NOT NULL,
    "sourceSystemLabel" TEXT,
    "fileName" TEXT,
    "fileChecksum" TEXT NOT NULL,
    "fileByteLength" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "reconciliationStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "clientBatchKey" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedFileChecksum" TEXT,
    "reconciledByUserId" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "startedImportAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "rowsParsed" INTEGER NOT NULL DEFAULT 0,
    "rowsValid" INTEGER NOT NULL DEFAULT 0,
    "rowsInvalid" INTEGER NOT NULL DEFAULT 0,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "rowsFailed" INTEGER NOT NULL DEFAULT 0,
    "chunkSize" INTEGER NOT NULL DEFAULT 200,
    "chunksTotal" INTEGER NOT NULL DEFAULT 0,
    "chunksValidated" INTEGER NOT NULL DEFAULT 0,
    "chunksImported" INTEGER NOT NULL DEFAULT 0,
    "reconciliationJson" TEXT,
    "exceptionReportJson" TEXT,
    "summaryJson" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MigrationBatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MigrationBatch_templateKind_check" CHECK ("templateKind" IN ('CATALOGUE', 'SUPPLIERS', 'OPENING_STOCK')),
    CONSTRAINT "MigrationBatch_status_check" CHECK ("status" IN (
      'UPLOADED', 'VALIDATING', 'VALIDATION_FAILED', 'READY_FOR_APPROVAL',
      'APPROVED', 'IMPORTING', 'COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'FAILED'
    )),
    CONSTRAINT "MigrationBatch_reconciliationStatus_check" CHECK ("reconciliationStatus" IN (
      'NOT_STARTED', 'PENDING', 'MATCHED', 'MISMATCHED', 'ACCEPTED'
    )),
    CONSTRAINT "MigrationBatch_sourceSystemKey_check" CHECK ("sourceSystemKey" ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
    CONSTRAINT "MigrationBatch_fileChecksum_check" CHECK ("fileChecksum" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "MigrationEntityMap" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "migrationBatchId" TEXT NOT NULL,
    "sourceSystemKey" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MigrationEntityMap_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MigrationEntityMap_entityType_check" CHECK ("entityType" IN ('PRODUCT', 'SUPPLIER', 'CATEGORY')),
    CONSTRAINT "MigrationEntityMap_sourceSystemKey_check" CHECK ("sourceSystemKey" ~ '^[a-z0-9][a-z0-9_-]{1,62}$')
);

CREATE TABLE "MigrationChunkReceipt" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "migrationBatchId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "fileChecksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MigrationChunkReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MigrationChunkReceipt_phase_check" CHECK ("phase" IN ('VALIDATE', 'IMPORT')),
    CONSTRAINT "MigrationChunkReceipt_status_check" CHECK ("status" IN ('COMPLETED'))
);

CREATE TABLE "MigrationOpeningStockPosting" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "migrationBatchId" TEXT NOT NULL,
    "sourceSystemKey" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "qtyBase" INTEGER NOT NULL,
    "unitCostBasePence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MigrationOpeningStockPosting_pkey" PRIMARY KEY ("id")
);

-- Tenant-aware uniqueness / lookup
CREATE UNIQUE INDEX "MigrationBatch_businessId_id_key" ON "MigrationBatch"("businessId", "id");
CREATE UNIQUE INDEX "MigrationBatch_businessId_clientBatchKey_key" ON "MigrationBatch"("businessId", "clientBatchKey");
CREATE INDEX "MigrationBatch_businessId_status_createdAt_idx" ON "MigrationBatch"("businessId", "status", "createdAt");
CREATE INDEX "MigrationBatch_businessId_sourceSystemKey_idx" ON "MigrationBatch"("businessId", "sourceSystemKey");
CREATE INDEX "MigrationBatch_businessId_fileChecksum_idx" ON "MigrationBatch"("businessId", "fileChecksum");

CREATE UNIQUE INDEX "MigrationEntityMap_businessId_sourceSystemKey_entityType_sourceReference_key"
  ON "MigrationEntityMap"("businessId", "sourceSystemKey", "entityType", "sourceReference");
CREATE INDEX "MigrationEntityMap_businessId_entityType_targetId_idx" ON "MigrationEntityMap"("businessId", "entityType", "targetId");
CREATE INDEX "MigrationEntityMap_businessId_migrationBatchId_idx" ON "MigrationEntityMap"("businessId", "migrationBatchId");

CREATE UNIQUE INDEX "MigrationChunkReceipt_businessId_migrationBatchId_phase_chunkIndex_key"
  ON "MigrationChunkReceipt"("businessId", "migrationBatchId", "phase", "chunkIndex");
CREATE INDEX "MigrationChunkReceipt_businessId_migrationBatchId_idx" ON "MigrationChunkReceipt"("businessId", "migrationBatchId");

CREATE UNIQUE INDEX "MigrationOpeningStockPosting_businessId_migrationBatchId_storeId_productId_key"
  ON "MigrationOpeningStockPosting"("businessId", "migrationBatchId", "storeId", "productId");
CREATE UNIQUE INDEX "MigrationOpeningStockPosting_businessId_referenceId_key"
  ON "MigrationOpeningStockPosting"("businessId", "referenceId");
CREATE INDEX "MigrationOpeningStockPosting_businessId_sourceSystemKey_sourceReference_idx"
  ON "MigrationOpeningStockPosting"("businessId", "sourceSystemKey", "sourceReference");
CREATE INDEX "MigrationOpeningStockPosting_storeId_productId_idx" ON "MigrationOpeningStockPosting"("storeId", "productId");

-- FKs: Business cascade (tenant wipe). Users SetNull (preserve audit).
ALTER TABLE "MigrationBatch" ADD CONSTRAINT "MigrationBatch_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MigrationBatch" ADD CONSTRAINT "MigrationBatch_uploadedByUserId_fkey"
  FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MigrationBatch" ADD CONSTRAINT "MigrationBatch_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MigrationBatch" ADD CONSTRAINT "MigrationBatch_reconciledByUserId_fkey"
  FOREIGN KEY ("reconciledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Composite tenant-aware FKs: child cannot reference another tenant's batch.
ALTER TABLE "MigrationEntityMap" ADD CONSTRAINT "MigrationEntityMap_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MigrationEntityMap" ADD CONSTRAINT "MigrationEntityMap_businessId_migrationBatchId_fkey"
  FOREIGN KEY ("businessId", "migrationBatchId") REFERENCES "MigrationBatch"("businessId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MigrationChunkReceipt" ADD CONSTRAINT "MigrationChunkReceipt_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MigrationChunkReceipt" ADD CONSTRAINT "MigrationChunkReceipt_businessId_migrationBatchId_fkey"
  FOREIGN KEY ("businessId", "migrationBatchId") REFERENCES "MigrationBatch"("businessId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MigrationOpeningStockPosting" ADD CONSTRAINT "MigrationOpeningStockPosting_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MigrationOpeningStockPosting" ADD CONSTRAINT "MigrationOpeningStockPosting_businessId_migrationBatchId_fkey"
  FOREIGN KEY ("businessId", "migrationBatchId") REFERENCES "MigrationBatch"("businessId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
