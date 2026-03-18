-- Capture the resolved cost at time of sale on each invoice line.
-- Aligns product-level margin reports with journal-based COGS.

ALTER TABLE "SalesInvoiceLine"
ADD COLUMN "lineCostPence" INTEGER NOT NULL DEFAULT 0;
