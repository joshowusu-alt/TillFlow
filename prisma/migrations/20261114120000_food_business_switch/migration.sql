-- Move existing "Food business with stock" businesses onto dish setup.
-- Only Business.businessCategory changes, and only when it is exactly RESTAURANT_STOCK.
-- Products, stock, prices and sales are not updated.
-- Supermarket EL-SHADDAI (cmmttryrq00015gcwrix832dg) is excluded even if its category ever matched.
-- Running this again is a no-op: the log primary key and the category filter both stop a second change.
--
-- Reverse is foodBusinessSwitchReverseSql() in lib/food/switch-food-businesses.ts.
-- It restores fromCategory only while the business is still on FOOD_DISHES, then deletes the log row.

ALTER TABLE "FoodDish" ADD COLUMN "costPerPortionPence" INTEGER;

CREATE TABLE "FoodBusinessTypeSwitch" (
    "businessId" TEXT NOT NULL,
    "fromCategory" TEXT NOT NULL,
    "toCategory" TEXT NOT NULL,
    "switchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodBusinessTypeSwitch_pkey" PRIMARY KEY ("businessId")
);

ALTER TABLE "FoodBusinessTypeSwitch"
  ADD CONSTRAINT "FoodBusinessTypeSwitch_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "FoodBusinessTypeSwitch" ("businessId", "fromCategory", "toCategory")
SELECT "id", "businessCategory", 'FOOD_DISHES'
FROM "Business"
WHERE "businessCategory" = 'RESTAURANT_STOCK'
  AND "id" <> 'cmmttryrq00015gcwrix832dg'
ON CONFLICT ("businessId") DO NOTHING;

UPDATE "Business" AS b
SET "businessCategory" = 'FOOD_DISHES'
FROM "FoodBusinessTypeSwitch" AS s
WHERE b."id" = s."businessId"
  AND b."businessCategory" = 'RESTAURANT_STOCK'
  AND b."id" <> 'cmmttryrq00015gcwrix832dg';
