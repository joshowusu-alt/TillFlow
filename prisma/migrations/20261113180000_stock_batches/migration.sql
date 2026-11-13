-- Optional production and expiry dates on new receipts.
-- Additive only. InventoryBalance.qtyOnHandBase remains the stock quantity.
-- Existing stock is not copied into batches.

CREATE TABLE "StockBatch" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyReceivedBase" INTEGER NOT NULL,
    "productionDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "purchaseLineId" TEXT,
    "openingReferenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockBatch_purchaseLineId_key" ON "StockBatch"("purchaseLineId");
CREATE INDEX "StockBatch_businessId_storeId_expiryDate_idx" ON "StockBatch"("businessId", "storeId", "expiryDate");
CREATE INDEX "StockBatch_storeId_productId_createdAt_idx" ON "StockBatch"("storeId", "productId", "createdAt");
CREATE INDEX "StockBatch_productId_idx" ON "StockBatch"("productId");
CREATE INDEX "StockBatch_openingReferenceId_idx" ON "StockBatch"("openingReferenceId");

ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_purchaseLineId_fkey" FOREIGN KEY ("purchaseLineId") REFERENCES "PurchaseInvoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_source_check" CHECK ("source" IN ('PURCHASE', 'OPENING_STOCK', 'IMPORT'));
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_qty_check" CHECK ("qtyReceivedBase" > 0);
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_dates_check" CHECK ("productionDate" IS NULL OR "expiryDate" IS NULL OR "expiryDate" >= "productionDate");
