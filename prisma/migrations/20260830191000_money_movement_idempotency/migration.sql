-- Dedicated MoneyIdempotency table for customer receipts, expense payments,
-- expense-create first payments, and purchase-create embedded payments.
-- Forward-only and null-safe: new table, no backfill, existing payment rows unchanged.
-- Supplier payments keep PurchasePayment (businessId, idempotencyKey) uniqueness.

CREATE TABLE "MoneyIdempotency" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "commandKind" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyIdempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MoneyIdempotency_businessId_key_key"
  ON "MoneyIdempotency"("businessId", "key");

CREATE INDEX "MoneyIdempotency_businessId_createdAt_idx"
  ON "MoneyIdempotency"("businessId", "createdAt");

ALTER TABLE "MoneyIdempotency"
  ADD CONSTRAINT "MoneyIdempotency_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
