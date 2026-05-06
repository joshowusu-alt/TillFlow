-- Migration: add_brand_identity_fields
-- Adds structured merchant branding assets and rendering preferences so TillFlow
-- can choose different logo treatments per surface.

ALTER TABLE "Business" ADD COLUMN "brandCompactLogoUrl" TEXT;
ALTER TABLE "Business" ADD COLUMN "brandSquareLogoUrl" TEXT;
ALTER TABLE "Business" ADD COLUMN "brandInitials" TEXT;
ALTER TABLE "Business" ADD COLUMN "brandPrimaryColor" TEXT;
ALTER TABLE "Business" ADD COLUMN "brandCompactMode" TEXT NOT NULL DEFAULT 'AUTO';
ALTER TABLE "Business" ADD COLUMN "brandLogoBackground" TEXT NOT NULL DEFAULT 'AUTO';
