ALTER TABLE "FoodDish" ADD COLUMN "allowCustomAmount" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "minimumAmountPence" INTEGER;
ALTER TABLE "SalesInvoiceLine" ADD COLUMN "customAmountPence" INTEGER;
