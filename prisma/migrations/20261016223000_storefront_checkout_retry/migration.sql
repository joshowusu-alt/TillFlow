ALTER TABLE "OnlineOrder" ADD COLUMN "checkoutKey" TEXT;
ALTER TABLE "OnlineOrder" ADD COLUMN "checkoutFingerprint" TEXT;
CREATE UNIQUE INDEX "OnlineOrder_businessId_checkoutKey_key" ON "OnlineOrder"("businessId", "checkoutKey");
