-- CreateTable
CREATE TABLE "PharmacySettings" (
    "businessId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacySettings_pkey" PRIMARY KEY ("businessId")
);

-- CreateTable
CREATE TABLE "PharmacyPractitioner" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "registrationExpiresAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "recordedByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyPractitioner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyProductRule" (
    "productId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "medicineClass" TEXT NOT NULL,
    "minimumPatientAge" INTEGER,
    "checkInstructions" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyProductRule_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "PharmacyBatch" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "qtyRemainingBase" INTEGER NOT NULL,
    "quarantined" BOOLEAN NOT NULL DEFAULT false,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyPrescription" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "patientDateOfBirth" TIMESTAMP(3) NOT NULL,
    "prescriberName" TEXT NOT NULL,
    "prescriberReference" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "documentName" TEXT NOT NULL,
    "documentContentType" TEXT NOT NULL,
    "documentBody" BYTEA NOT NULL,
    "documentSha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyPrescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyPrescriptionLine" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "authorisedQtyBase" INTEGER NOT NULL,
    "dispensedQtyBase" INTEGER NOT NULL DEFAULT 0,
    "directions" TEXT NOT NULL,

    CONSTRAINT "PharmacyPrescriptionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyReview" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "cashierUserId" TEXT NOT NULL,
    "checkoutRef" TEXT NOT NULL,
    "cartJson" TEXT NOT NULL,
    "cartHash" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "patientDateOfBirth" TIMESTAMP(3),
    "ageCheckConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "prescriptionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pharmacistUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "salesInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyDispenseAllocation" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyBase" INTEGER NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyDispenseAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyPractitioner_businessId_userId_key" ON "PharmacyPractitioner"("businessId", "userId");

-- CreateIndex
CREATE INDEX "PharmacyProductRule_businessId_idx" ON "PharmacyProductRule"("businessId");

-- CreateIndex
CREATE INDEX "PharmacyBatch_businessId_storeId_productId_expiresAt_idx" ON "PharmacyBatch"("businessId", "storeId", "productId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyBatch_businessId_storeId_productId_batchNumber_key" ON "PharmacyBatch"("businessId", "storeId", "productId", "batchNumber");

-- CreateIndex
CREATE INDEX "PharmacyPrescription_businessId_createdAt_idx" ON "PharmacyPrescription"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyPrescriptionLine_prescriptionId_productId_key" ON "PharmacyPrescriptionLine"("prescriptionId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyReview_salesInvoiceId_key" ON "PharmacyReview"("salesInvoiceId");

-- CreateIndex
CREATE INDEX "PharmacyReview_businessId_storeId_status_createdAt_idx" ON "PharmacyReview"("businessId", "storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PharmacyDispenseAllocation_batchId_idx" ON "PharmacyDispenseAllocation"("batchId");

-- AddForeignKey
ALTER TABLE "PharmacyPrescriptionLine" ADD CONSTRAINT "PharmacyPrescriptionLine_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "PharmacyPrescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispenseAllocation" ADD CONSTRAINT "PharmacyDispenseAllocation_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PharmacyReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "PharmacyBatch" ADD CONSTRAINT "PharmacyBatch_nonnegative_qty" CHECK ("qtyRemainingBase" >= 0);
ALTER TABLE "PharmacyProductRule" ADD CONSTRAINT "PharmacyProductRule_class_age" CHECK ("medicineClass" IN ('GENERAL','OTC','PHARMACIST','PRESCRIPTION') AND ("minimumPatientAge" IS NULL OR "minimumPatientAge" BETWEEN 0 AND 120));
ALTER TABLE "PharmacyPrescriptionLine" ADD CONSTRAINT "PharmacyPrescriptionLine_quantity_bounds" CHECK ("authorisedQtyBase" > 0 AND "dispensedQtyBase" >= 0 AND "dispensedQtyBase" <= "authorisedQtyBase");
ALTER TABLE "PharmacyDispenseAllocation" ADD CONSTRAINT "PharmacyDispenseAllocation_positive_qty" CHECK ("qtyBase" > 0);
