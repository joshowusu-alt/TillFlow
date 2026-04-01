-- Add configurable minimum margin thresholds for business-wide defaults
-- and optional product-level overrides.

ALTER TABLE "Business"
ADD COLUMN "minimumMarginThresholdBps" INTEGER NOT NULL DEFAULT 1500;

ALTER TABLE "Product"
ADD COLUMN "minimumMarginThresholdBps" INTEGER;