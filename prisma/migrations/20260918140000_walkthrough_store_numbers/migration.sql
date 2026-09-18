-- Additive uniqueness for presentation numbers and customer-receipt numbers.
-- Historic nulls remain valid. No backfill.

ALTER TABLE "SalesPayment" ADD COLUMN "businessId" TEXT;
ALTER TABLE "SalesPayment" ADD COLUMN "transactionNumber" TEXT;
CREATE UNIQUE INDEX "SalesPayment_businessId_transactionNumber_key"
  ON "SalesPayment"("businessId", "transactionNumber");

CREATE UNIQUE INDEX "StockAdjustment_storeId_transactionNumber_key"
  ON "StockAdjustment"("storeId", "transactionNumber");

CREATE UNIQUE INDEX "Stocktake_storeId_transactionNumber_key"
  ON "Stocktake"("storeId", "transactionNumber");

CREATE UNIQUE INDEX "Shift_tillId_closureNumber_key"
  ON "Shift"("tillId", "closureNumber");
