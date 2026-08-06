-- Migration Framework P0: package-oriented foundation.
-- NOT applied to Preview or Production by this PR authorisation.
-- Adds MigrationPackage, MigrationFile, MigrationBranchMapping and tenant-safe Store uniqueness.

-- Tenant-aware composite uniqueness for Store (enables composite FKs from branch mappings).
CREATE UNIQUE INDEX "Store_businessId_id_key" ON "Store"("businessId", "id");

-- CreateTable
CREATE TABLE "MigrationPackage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "contractVersion" TEXT NOT NULL,
    "sourceSystemKey" TEXT NOT NULL,
    "sourceBusinessKey" TEXT NOT NULL,
    "reportingCurrency" TEXT NOT NULL,
    "packageAsOfDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reconciliationStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "clientPackageKey" TEXT,
    "manifestChecksum" TEXT,
    "approvedManifestChecksum" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "expiredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT,
    "validatedByUserId" TEXT,
    "validatedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executedByUserId" TEXT,
    "executedAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "summaryJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MigrationPackage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MigrationPackage_status_check" CHECK (
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
        'CANCELLED'
      )
    ),
    CONSTRAINT "MigrationPackage_reconciliationStatus_check" CHECK (
      "reconciliationStatus" IN (
        'NOT_STARTED',
        'RECONCILING',
        'MATCHED',
        'MISMATCHED',
        'RECONCILIATION_FAILED'
      )
    )
);

-- CreateTable
CREATE TABLE "MigrationFile" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "originalFilename" TEXT,
    "contentType" TEXT,
    "byteLength" INTEGER NOT NULL DEFAULT 0,
    "uploadChecksum" TEXT NOT NULL,
    "validationChecksum" TEXT,
    "approvedChecksum" TEXT,
    "storageKey" TEXT,
    "rowCount" INTEGER,
    "validatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MigrationFile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MigrationFile_entityType_check" CHECK (
      "entityType" IN ('SUPPLIERS', 'PRODUCTS', 'OPENING_STOCK')
    )
);

-- CreateTable
CREATE TABLE "MigrationBranchMapping" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "sourceBranchKey" TEXT NOT NULL,
    "targetStoreId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MigrationBranchMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MigrationPackage_businessId_id_key" ON "MigrationPackage"("businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationPackage_businessId_clientPackageKey_key" ON "MigrationPackage"("businessId", "clientPackageKey");

-- CreateIndex
CREATE INDEX "MigrationPackage_businessId_status_createdAt_idx" ON "MigrationPackage"("businessId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MigrationPackage_businessId_status_expiresAt_idx" ON "MigrationPackage"("businessId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "MigrationPackage_businessId_sourceSystemKey_sourceBusinessKey_idx" ON "MigrationPackage"("businessId", "sourceSystemKey", "sourceBusinessKey");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationFile_businessId_id_key" ON "MigrationFile"("businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationFile_packageId_entityType_key" ON "MigrationFile"("packageId", "entityType");

-- CreateIndex
CREATE INDEX "MigrationFile_businessId_packageId_idx" ON "MigrationFile"("businessId", "packageId");

-- CreateIndex
CREATE INDEX "MigrationFile_businessId_uploadChecksum_idx" ON "MigrationFile"("businessId", "uploadChecksum");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationBranchMapping_businessId_id_key" ON "MigrationBranchMapping"("businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationBranchMapping_packageId_sourceBranchKey_key" ON "MigrationBranchMapping"("packageId", "sourceBranchKey");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationBranchMapping_packageId_targetStoreId_key" ON "MigrationBranchMapping"("packageId", "targetStoreId");

-- CreateIndex
CREATE INDEX "MigrationBranchMapping_businessId_packageId_idx" ON "MigrationBranchMapping"("businessId", "packageId");

-- CreateIndex
CREATE INDEX "MigrationBranchMapping_businessId_targetStoreId_idx" ON "MigrationBranchMapping"("businessId", "targetStoreId");

-- AddForeignKey
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_validatedByUserId_fkey" FOREIGN KEY ("validatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_executedByUserId_fkey" FOREIGN KEY ("executedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigrationPackage" ADD CONSTRAINT "MigrationPackage_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey — tenant-scoped package membership for files
ALTER TABLE "MigrationFile" ADD CONSTRAINT "MigrationFile_businessId_packageId_fkey" FOREIGN KEY ("businessId", "packageId") REFERENCES "MigrationPackage"("businessId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey — tenant-scoped package membership for branch mappings
ALTER TABLE "MigrationBranchMapping" ADD CONSTRAINT "MigrationBranchMapping_businessId_packageId_fkey" FOREIGN KEY ("businessId", "packageId") REFERENCES "MigrationPackage"("businessId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey — store must belong to the same business (composite)
ALTER TABLE "MigrationBranchMapping" ADD CONSTRAINT "MigrationBranchMapping_businessId_targetStoreId_fkey" FOREIGN KEY ("businessId", "targetStoreId") REFERENCES "Store"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
