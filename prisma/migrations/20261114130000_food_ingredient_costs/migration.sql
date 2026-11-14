ALTER TABLE "FoodDish" ADD COLUMN "recipeJson" TEXT;
ALTER TABLE "FoodDishSize" ADD COLUMN "recipeJson" TEXT;
ALTER TABLE "FoodPreparation" ADD COLUMN "costPerPortionPence" INTEGER;
CREATE TABLE "FoodIngredientUsage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "FoodIngredientUsage_businessId_idempotencyKey_key"
  ON "FoodIngredientUsage" ("businessId", "idempotencyKey");
