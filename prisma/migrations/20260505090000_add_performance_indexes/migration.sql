-- Phase 1 performance indexes: scalability hardening for 1,000 businesses x 1,000 tx/day.
-- Adds missing FK and hot-filter indexes identified in the May 2026 performance audit.

-- SalesInvoice: till / shift / discount-approver FK lookups
CREATE INDEX "SalesInvoice_tillId_idx" ON "SalesInvoice"("tillId");
CREATE INDEX "SalesInvoice_shiftId_idx" ON "SalesInvoice"("shiftId");
CREATE INDEX "SalesInvoice_discountApprovedByUserId_idx" ON "SalesInvoice"("discountApprovedByUserId");

-- Product: supplier FK + storefront published filter (used on every storefront catalog load)
CREATE INDEX "Product_preferredSupplierId_idx" ON "Product"("preferredSupplierId");
CREATE INDEX "Product_businessId_active_storefrontPublished_idx" ON "Product"("businessId", "active", "storefrontPublished");

-- Expense: user audit / report lookups
CREATE INDEX "Expense_userId_createdAt_idx" ON "Expense"("userId", "createdAt");

-- StockMovement: user audit trail lookups
CREATE INDEX "StockMovement_userId_createdAt_idx" ON "StockMovement"("userId", "createdAt");

-- Business: WhatsApp EOD cron fan-out filter (WHERE whatsappEnabled = true AND isDemo = false)
CREATE INDEX "Business_whatsappEnabled_isDemo_idx" ON "Business"("whatsappEnabled", "isDemo");
