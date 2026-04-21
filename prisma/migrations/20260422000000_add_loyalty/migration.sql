-- Add loyalty programme fields to Business
ALTER TABLE "Business" ADD COLUMN "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN "loyaltyPointsPerGhsPence" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "Business" ADD COLUMN "loyaltyGhsPerHundredPoints" INTEGER NOT NULL DEFAULT 100;

-- Add loyalty points balance to Customer
ALTER TABLE "Customer" ADD COLUMN "loyaltyPointsBalance" INTEGER NOT NULL DEFAULT 0;

-- Add loyalty columns to SalesInvoice
ALTER TABLE "SalesInvoice" ADD COLUMN "loyaltyPointsEarned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesInvoice" ADD COLUMN "loyaltyPointsRedeemed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesInvoice" ADD COLUMN "loyaltyPointsValuePence" INTEGER NOT NULL DEFAULT 0;
