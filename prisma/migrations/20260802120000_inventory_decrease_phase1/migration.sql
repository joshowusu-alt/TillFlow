-- Lean inventory-decrease Phase 1: adjustment payload fields, idempotency,
-- and stocktake surplus review status. Additive / nullable for existing rows.

ALTER TABLE "StockAdjustment" ADD COLUMN "reasonCode" TEXT;
ALTER TABLE "StockAdjustment" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "StockAdjustment" ADD COLUMN "payloadHash" TEXT;
ALTER TABLE "StockAdjustment" ADD COLUMN "unitCostBasePence" INTEGER;
ALTER TABLE "StockAdjustment" ADD COLUMN "valuePence" INTEGER;
ALTER TABLE "StockAdjustment" ADD COLUMN "schemaVersion" INTEGER;

CREATE UNIQUE INDEX "StockAdjustment_storeId_idempotencyKey_key" ON "StockAdjustment"("storeId", "idempotencyKey");

ALTER TABLE "StocktakeLine" ADD COLUMN "reviewStatus" TEXT;

-- Remap unused legacy seed-once accounts only:
--   5100 / "Operating Expenses"  →  "Inventory Loss & Shrinkage"
-- Skip any 5100 row that already has journal lines or a customised name.
-- Canonical day-to-day operating expenses remain on 6000.
UPDATE "Account"
SET "name" = 'Inventory Loss & Shrinkage'
WHERE "code" = '5100'
  AND "name" = 'Operating Expenses'
  AND NOT EXISTS (
    SELECT 1 FROM "JournalLine" AS jl WHERE jl."accountId" = "Account"."id"
  );
