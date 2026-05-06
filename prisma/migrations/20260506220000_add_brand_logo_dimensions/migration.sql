-- Migration: add_brand_logo_dimensions
-- Stores pixel width and height for each uploaded brand asset so the brand
-- rendering engine can apply aspect-ratio suitability gates server-side,
-- without requiring a client round-trip or AI analysis.
--
-- All columns are nullable: pre-existing rows keep NULL and the engine falls
-- back to the slot-based waterfall (same behaviour as before this migration).

ALTER TABLE "Business" ADD COLUMN "logoWidth"              INTEGER;
ALTER TABLE "Business" ADD COLUMN "logoHeight"             INTEGER;
ALTER TABLE "Business" ADD COLUMN "brandCompactLogoWidth"  INTEGER;
ALTER TABLE "Business" ADD COLUMN "brandCompactLogoHeight" INTEGER;
ALTER TABLE "Business" ADD COLUMN "brandSquareLogoWidth"   INTEGER;
ALTER TABLE "Business" ADD COLUMN "brandSquareLogoHeight"  INTEGER;
