-- Add refundNote field to OnlineOrder for recording refund details
ALTER TABLE "OnlineOrder" ADD COLUMN "refundNote" TEXT;
