-- Migration: add_customer_supplier_notes_tags
-- Adds free-form notes and a JSON-encoded tags array to both Customer and
-- Supplier so merchants can record metadata that doesn't fit existing fields
-- (e.g. "VIP", "Net 30", "Always pays late", delivery quirks, contact roles).

ALTER TABLE "Customer" ADD COLUMN "notes" TEXT;
ALTER TABLE "Customer" ADD COLUMN "tagsJson" TEXT;

ALTER TABLE "Supplier" ADD COLUMN "notes" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "tagsJson" TEXT;
