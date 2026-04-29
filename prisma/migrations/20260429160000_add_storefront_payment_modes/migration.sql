ALTER TABLE "Business" ADD COLUMN "storefrontPaymentMode" TEXT DEFAULT 'MOMO_NUMBER';
ALTER TABLE "Business" ADD COLUMN "storefrontMerchantShortcode" TEXT;
ALTER TABLE "Business" ADD COLUMN "storefrontBankName" TEXT;
ALTER TABLE "Business" ADD COLUMN "storefrontBankAccountName" TEXT;
ALTER TABLE "Business" ADD COLUMN "storefrontBankAccountNumber" TEXT;
ALTER TABLE "Business" ADD COLUMN "storefrontBankBranch" TEXT;
ALTER TABLE "Business" ADD COLUMN "storefrontPaymentNote" TEXT;
