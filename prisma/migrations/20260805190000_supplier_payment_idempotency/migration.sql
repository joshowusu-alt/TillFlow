-- Additive supplier-payment idempotency support.
-- Historical rows keep NULL idempotencyKey / payloadHash and are not reinterpreted.
-- businessId is denormalized for tenant-scoped uniqueness (NULL keys do not collide).

ALTER TABLE "PurchasePayment" ADD COLUMN "businessId" TEXT;
ALTER TABLE "PurchasePayment" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "PurchasePayment" ADD COLUMN "payloadHash" TEXT;

UPDATE "PurchasePayment" AS pp
SET "businessId" = pi."businessId"
FROM "PurchaseInvoice" AS pi
WHERE pp."purchaseInvoiceId" = pi."id"
  AND pp."businessId" IS NULL;

ALTER TABLE "PurchasePayment"
  ADD CONSTRAINT "PurchasePayment_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PurchasePayment_businessId_idempotencyKey_key"
  ON "PurchasePayment"("businessId", "idempotencyKey");

CREATE INDEX "PurchasePayment_businessId_paidAt_idx"
  ON "PurchasePayment"("businessId", "paidAt");
