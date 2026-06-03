-- Slice 4: product import history
CREATE TABLE "ProductImport" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "fileName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "rowsParsed" INTEGER NOT NULL DEFAULT 0,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "rowsUpdated" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "rowsErrors" INTEGER NOT NULL DEFAULT 0,
    "rowsWarnings" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" TEXT,
    "errorReportJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductImport_businessId_createdAt_idx" ON "ProductImport"("businessId", "createdAt");

ALTER TABLE "ProductImport" ADD CONSTRAINT "ProductImport_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductImport" ADD CONSTRAINT "ProductImport_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
