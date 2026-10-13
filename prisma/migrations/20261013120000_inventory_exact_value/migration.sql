-- Forward tracking only: NULL legacy values are not reconstructed or reposted.
ALTER TABLE "InventoryBalance" ADD COLUMN "knownValuePence" INTEGER;
ALTER TABLE "InventoryBalance" ADD COLUMN "unvaluedQtyBase" INTEGER;
ALTER TABLE "StockMovement" ADD COLUMN "valuePence" INTEGER;
ALTER TABLE "StockMovement" ADD COLUMN "costBasis" TEXT;
ALTER TABLE "SalesInvoiceLine" ADD COLUMN "costBasis" TEXT;
ALTER TABLE "SalesInvoice" ALTER COLUMN "grossMarginPence" DROP NOT NULL;
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_known_value_nonnegative" CHECK ("knownValuePence" IS NULL OR "knownValuePence" >= 0);
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_unvalued_qty_nonnegative" CHECK ("unvaluedQtyBase" IS NULL OR "unvaluedQtyBase" >= 0);
