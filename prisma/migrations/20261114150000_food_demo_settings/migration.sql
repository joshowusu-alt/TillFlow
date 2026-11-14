ALTER TABLE "Product" ADD COLUMN "ingredientOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN "storefrontMomoAccountName" TEXT;
ALTER TABLE "ControlSubscription" ADD COLUMN "monthlyValueMinorUnits" INTEGER;
