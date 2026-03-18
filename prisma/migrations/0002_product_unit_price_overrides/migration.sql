-- Add explicit per-unit selling/cost overrides for configured sellable units.
-- Nullable on purpose to preserve all legacy product behavior through fallback
-- pricing logic with zero stock/value reinterpretation.

ALTER TABLE "ProductUnit"
ADD COLUMN "sellingPricePence" INTEGER;

ALTER TABLE "ProductUnit"
ADD COLUMN "defaultCostPence" INTEGER;