-- Export undo metadata before removing these columns. Ledger, movements and audit remain.
DROP INDEX "FoodIngredientUsage_businessId_storeId_createdAt_idx";
ALTER TABLE "FoodIngredientUsage" DROP COLUMN "undoneAt", DROP COLUMN "undoneById", DROP COLUMN "undoReason";
ALTER TABLE "FoodPreparation" DROP COLUMN "undoneAt", DROP COLUMN "undoneById", DROP COLUMN "undoReason";

-- Preserve historical return receipts and prevent new FOOD_UNDO writes.
ALTER TABLE "StockBatch" DROP CONSTRAINT "StockBatch_source_check";
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_source_check"
  CHECK ("source" IN ('PURCHASE', 'OPENING_STOCK', 'IMPORT')) NOT VALID;
