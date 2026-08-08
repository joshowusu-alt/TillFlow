-- Forward-only SalesPayment.receiptOrigin foundation.
--
-- NULL on existing rows = historical UNCLASSIFIED (no speculative backfill).
-- New application write paths must persist an explicit non-null value:
--   RECEIVED_AT_SALE | LATER_CREDIT_COLLECTION | UNCLASSIFIED
--
-- Additive, nullable, no DEFAULT rewrite of historical rows.
-- Compatible with old app builds that ignore the column.
-- Rollback: DROP CONSTRAINT then DROP COLUMN (data in this column is lost on rollback).

ALTER TABLE "SalesPayment" ADD COLUMN "receiptOrigin" TEXT;

ALTER TABLE "SalesPayment"
  ADD CONSTRAINT "SalesPayment_receiptOrigin_check"
  CHECK (
    "receiptOrigin" IS NULL
    OR "receiptOrigin" IN (
      'RECEIVED_AT_SALE',
      'LATER_CREDIT_COLLECTION',
      'UNCLASSIFIED'
    )
  );
