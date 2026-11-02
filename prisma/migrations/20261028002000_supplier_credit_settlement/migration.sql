ALTER TABLE "PurchaseInvoice" ADD COLUMN "creditSettledPence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "creditAppliedPence" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "SupplierCreditSettlement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "sourceInvoiceId" TEXT NOT NULL REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "targetInvoiceId" TEXT REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amountPence" INTEGER NOT NULL CHECK ("amountPence" > 0),
  "reference" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SupplierCreditSettlement_requestKey_key" ON "SupplierCreditSettlement"("requestKey");
CREATE INDEX "SupplierCreditSettlement_businessId_supplierId_createdAt_idx" ON "SupplierCreditSettlement"("businessId", "supplierId", "createdAt");
