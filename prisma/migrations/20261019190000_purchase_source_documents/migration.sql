CREATE TABLE "PurchaseDocument" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "purchaseInvoiceId" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "byteLength" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "body" BYTEA NOT NULL,
  "uploadedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseDocument_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseDocument_valid_size" CHECK ("byteLength" > 0 AND "byteLength" <= 2097152 AND octet_length("body") = "byteLength")
);
CREATE INDEX "PurchaseDocument_businessId_purchaseInvoiceId_idx" ON "PurchaseDocument"("businessId", "purchaseInvoiceId");
