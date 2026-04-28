ALTER TABLE "Business" ADD COLUMN "storefrontEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN "storefrontSlug" TEXT;
ALTER TABLE "Business" ADD COLUMN "storefrontHeadline" TEXT;
ALTER TABLE "Business" ADD COLUMN "storefrontDescription" TEXT;
ALTER TABLE "Business" ADD COLUMN "storefrontPickupInstructions" TEXT;

ALTER TABLE "Product" ADD COLUMN "storefrontPublished" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "storefrontDescription" TEXT;

CREATE UNIQUE INDEX "Business_storefrontSlug_key" ON "Business"("storefrontSlug");

CREATE TABLE "OnlineOrder" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "paymentCollectionId" TEXT,
  "publicToken" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',
  "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "fulfillmentMethod" TEXT NOT NULL DEFAULT 'PICKUP',
  "fulfillmentStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "customerName" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "customerEmail" TEXT,
  "customerNotes" TEXT,
  "subtotalPence" INTEGER NOT NULL,
  "vatPence" INTEGER NOT NULL DEFAULT 0,
  "totalPence" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GHS',
  "paidAt" TIMESTAMP(3),
  "fulfilledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnlineOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnlineOrderLine" (
  "id" TEXT NOT NULL,
  "onlineOrderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "unitName" TEXT NOT NULL,
  "imageUrl" TEXT,
  "qtyInUnit" INTEGER NOT NULL,
  "conversionToBase" INTEGER NOT NULL DEFAULT 1,
  "qtyBase" INTEGER NOT NULL,
  "unitPricePence" INTEGER NOT NULL,
  "lineSubtotalPence" INTEGER NOT NULL,
  "lineVatPence" INTEGER NOT NULL DEFAULT 0,
  "lineTotalPence" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnlineOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnlineOrder_publicToken_key" ON "OnlineOrder"("publicToken");
CREATE UNIQUE INDEX "OnlineOrder_paymentCollectionId_key" ON "OnlineOrder"("paymentCollectionId");
CREATE UNIQUE INDEX "OnlineOrder_businessId_orderNumber_key" ON "OnlineOrder"("businessId", "orderNumber");
CREATE INDEX "OnlineOrder_businessId_createdAt_idx" ON "OnlineOrder"("businessId", "createdAt");
CREATE INDEX "OnlineOrder_storeId_createdAt_idx" ON "OnlineOrder"("storeId", "createdAt");
CREATE INDEX "OnlineOrder_businessId_status_createdAt_idx" ON "OnlineOrder"("businessId", "status", "createdAt");
CREATE INDEX "OnlineOrder_paymentStatus_createdAt_idx" ON "OnlineOrder"("paymentStatus", "createdAt");

CREATE INDEX "OnlineOrderLine_onlineOrderId_idx" ON "OnlineOrderLine"("onlineOrderId");
CREATE INDEX "OnlineOrderLine_productId_idx" ON "OnlineOrderLine"("productId");

ALTER TABLE "OnlineOrder"
ADD CONSTRAINT "OnlineOrder_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OnlineOrder"
ADD CONSTRAINT "OnlineOrder_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OnlineOrder"
ADD CONSTRAINT "OnlineOrder_paymentCollectionId_fkey"
FOREIGN KEY ("paymentCollectionId") REFERENCES "MobileMoneyCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OnlineOrderLine"
ADD CONSTRAINT "OnlineOrderLine_onlineOrderId_fkey"
FOREIGN KEY ("onlineOrderId") REFERENCES "OnlineOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OnlineOrderLine"
ADD CONSTRAINT "OnlineOrderLine_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OnlineOrderLine"
ADD CONSTRAINT "OnlineOrderLine_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
