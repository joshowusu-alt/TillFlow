ALTER TABLE "OnlineOrder" ADD COLUMN "paymentConfirmedAt" TIMESTAMP(3);
ALTER TABLE "OnlineOrder" ADD COLUMN "preparingAt" TIMESTAMP(3);
ALTER TABLE "OnlineOrder" ADD COLUMN "readyAt" TIMESTAMP(3);
ALTER TABLE "OnlineOrder" ADD COLUMN "collectedAt" TIMESTAMP(3);
ALTER TABLE "OnlineOrder" ADD COLUMN "cancelledAt" TIMESTAMP(3);
