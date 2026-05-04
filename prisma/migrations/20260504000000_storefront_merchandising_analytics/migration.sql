-- Storefront public taxonomy and lightweight commerce analytics.

CREATE TABLE "StorefrontCategoryMapping" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "rawCategoryName" TEXT NOT NULL,
  "publicCategoryName" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StorefrontCategoryMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorefrontCategoryMapping_businessId_rawCategoryName_key"
  ON "StorefrontCategoryMapping"("businessId", "rawCategoryName");

CREATE INDEX "StorefrontCategoryMapping_businessId_priority_idx"
  ON "StorefrontCategoryMapping"("businessId", "priority");

ALTER TABLE "StorefrontCategoryMapping"
  ADD CONSTRAINT "StorefrontCategoryMapping_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StorefrontEvent" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "storeSlug" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "productId" TEXT,
  "sessionId" TEXT NOT NULL,
  "metadata" TEXT,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StorefrontEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StorefrontEvent_businessId_storeSlug_timestamp_idx"
  ON "StorefrontEvent"("businessId", "storeSlug", "timestamp");

CREATE INDEX "StorefrontEvent_businessId_eventType_timestamp_idx"
  ON "StorefrontEvent"("businessId", "eventType", "timestamp");

CREATE INDEX "StorefrontEvent_productId_eventType_idx"
  ON "StorefrontEvent"("productId", "eventType");

ALTER TABLE "StorefrontEvent"
  ADD CONSTRAINT "StorefrontEvent_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StorefrontEvent"
  ADD CONSTRAINT "StorefrontEvent_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
