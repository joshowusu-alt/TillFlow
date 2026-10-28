ALTER TABLE "PurchaseInvoice" ADD COLUMN "returnCreditPence" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "PurchaseReturnCredit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "purchaseInvoiceId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "creditPence" INTEGER NOT NULL,
  "linesJson" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseReturnCredit_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReturnCredit_creditPence_check" CHECK ("creditPence" >= 0)
);
CREATE UNIQUE INDEX "PurchaseReturnCredit_requestKey_key" ON "PurchaseReturnCredit"("requestKey");
CREATE INDEX "PurchaseReturnCredit_businessId_storeId_createdAt_idx" ON "PurchaseReturnCredit"("businessId", "storeId", "createdAt");
CREATE INDEX "PurchaseReturnCredit_purchaseInvoiceId_idx" ON "PurchaseReturnCredit"("purchaseInvoiceId");
