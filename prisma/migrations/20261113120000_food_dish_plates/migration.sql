-- Food dishes, plate snapshots and cooked-portion counts.
-- Additive only: existing products, sales and online orders gain a nullable column
-- and new empty tables. No existing row is rewritten.

ALTER TABLE "SalesInvoiceLine" ADD COLUMN "plateSnapshotJson" TEXT;
ALTER TABLE "OnlineOrderLine" ADD COLUMN "plateSnapshotJson" TEXT;

CREATE TABLE "FoodDish" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stockMode" TEXT NOT NULL DEFAULT 'NOT_COUNTED',
    "soldOut" BOOLEAN NOT NULL DEFAULT false,
    "lowAt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FoodDish_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoodDishSize" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricePence" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "FoodDishSize_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoodDishInclusion" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "stockPortions" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FoodDishInclusion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoodAddonGroup" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "selection" TEXT NOT NULL DEFAULT 'MANY',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FoodAddonGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoodAddon" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricePence" INTEGER NOT NULL DEFAULT 0,
    "maxQty" INTEGER NOT NULL DEFAULT 1,
    "stockPortions" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "FoodAddon_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoodPreparation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyBase" INTEGER NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodPreparation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FoodDish_productId_key" ON "FoodDish"("productId");
CREATE UNIQUE INDEX "FoodDish_businessId_productId_key" ON "FoodDish"("businessId", "productId");
CREATE INDEX "FoodDish_businessId_idx" ON "FoodDish"("businessId");
CREATE INDEX "FoodDishSize_dishId_sortOrder_idx" ON "FoodDishSize"("dishId", "sortOrder");
CREATE INDEX "FoodDishInclusion_dishId_sortOrder_idx" ON "FoodDishInclusion"("dishId", "sortOrder");
CREATE INDEX "FoodAddonGroup_dishId_sortOrder_idx" ON "FoodAddonGroup"("dishId", "sortOrder");
CREATE INDEX "FoodAddon_groupId_sortOrder_idx" ON "FoodAddon"("groupId", "sortOrder");
CREATE UNIQUE INDEX "FoodPreparation_businessId_idempotencyKey_key" ON "FoodPreparation"("businessId", "idempotencyKey");
CREATE INDEX "FoodPreparation_businessId_productId_createdAt_idx" ON "FoodPreparation"("businessId", "productId", "createdAt");
CREATE INDEX "FoodPreparation_storeId_createdAt_idx" ON "FoodPreparation"("storeId", "createdAt");

ALTER TABLE "FoodDish" ADD CONSTRAINT "FoodDish_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodDish" ADD CONSTRAINT "FoodDish_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodDishSize" ADD CONSTRAINT "FoodDishSize_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "FoodDish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodDishInclusion" ADD CONSTRAINT "FoodDishInclusion_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "FoodDish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodAddonGroup" ADD CONSTRAINT "FoodAddonGroup_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "FoodDish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodAddon" ADD CONSTRAINT "FoodAddon_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FoodAddonGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodPreparation" ADD CONSTRAINT "FoodPreparation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodPreparation" ADD CONSTRAINT "FoodPreparation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodPreparation" ADD CONSTRAINT "FoodPreparation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodPreparation" ADD CONSTRAINT "FoodPreparation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
