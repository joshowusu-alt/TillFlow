ALTER TABLE "OnlineOrder" ADD COLUMN "paymentConfigJson" TEXT;
ALTER TABLE "OnlineOrderLine" ADD COLUMN "lineCostPence" INTEGER;
ALTER TABLE "OnlineOrderLine" ADD COLUMN "costBasis" TEXT;
