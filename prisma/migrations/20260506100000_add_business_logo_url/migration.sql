-- Migration: add_business_logo_url
-- Adds a canonical Business.logoUrl that cascades to the storefront header,
-- the admin TopNav, and printed receipts. The existing storefrontLogoUrl and
-- receiptLogoUrl columns are preserved as per-surface overrides for merchants
-- who want different artwork on different surfaces.

ALTER TABLE "Business" ADD COLUMN "logoUrl" TEXT;
