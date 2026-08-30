-- New businesses require an open till. Existing stored values are intentionally unchanged.
ALTER TABLE "Business"
  ALTER COLUMN "requireOpenTillForSales" SET DEFAULT true;

-- Historical invoices remain NULL so reports can classify them as unreconciled legacy.
ALTER TABLE "SalesInvoice"
  ADD COLUMN "saleSource" TEXT;

ALTER TABLE "SalesInvoice"
  ALTER COLUMN "saleSource" SET DEFAULT 'POS';

ALTER TABLE "SalesInvoice"
  ADD CONSTRAINT "SalesInvoice_saleSource_check"
  CHECK (
    "saleSource" IS NULL OR
    "saleSource" IN ('POS', 'ONLINE_ORDER', 'LATE_OFFLINE', 'UNRECONCILED_LEGACY')
  );
