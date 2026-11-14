ALTER TABLE "FoodPreparation"
  ADD COLUMN "undoneAt" TIMESTAMP(3),
  ADD COLUMN "undoneById" TEXT,
  ADD COLUMN "undoReason" TEXT;
ALTER TABLE "FoodIngredientUsage"
  ADD COLUMN "undoneAt" TIMESTAMP(3),
  ADD COLUMN "undoneById" TEXT,
  ADD COLUMN "undoReason" TEXT;
CREATE INDEX "FoodIngredientUsage_businessId_storeId_createdAt_idx"
  ON "FoodIngredientUsage" ("businessId", "storeId", "createdAt");

ALTER TABLE "StockBatch" DROP CONSTRAINT "StockBatch_source_check";
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_source_check"
  CHECK ("source" IN ('PURCHASE', 'OPENING_STOCK', 'IMPORT', 'FOOD_UNDO')) NOT VALID;
