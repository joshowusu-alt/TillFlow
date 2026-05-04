-- Phase 2 SMS notifications: durable outbox + per-merchant opt-in.
-- The schema declares the status / eventType / channel as plain TEXT to stay
-- compatible with the SQLite local provider; here we add CHECK constraints
-- so the production Postgres copy enforces the same value set as enums would.

ALTER TABLE "Business" ADD COLUMN "smsNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN "smsSenderId" TEXT;


CREATE TABLE "MessageOutbox" (
  "id"            TEXT NOT NULL,
  "businessId"    TEXT NOT NULL,
  "onlineOrderId" TEXT,
  "eventType"     TEXT NOT NULL,
  "channel"       TEXT NOT NULL DEFAULT 'SMS',
  "recipient"     TEXT NOT NULL,
  "body"          TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'PENDING',
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "lastError"     TEXT,
  "lockedAt"      TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3),
  "sentAt"        TIMESTAMP(3),
  "payloadJson"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessageOutbox_eventType_check"
    CHECK ("eventType" IN ('ORDER_RECEIVED', 'PAYMENT_CONFIRMED', 'READY_FOR_PICKUP', 'CANCELLED')),
  CONSTRAINT "MessageOutbox_channel_check"
    CHECK ("channel" IN ('SMS')),
  CONSTRAINT "MessageOutbox_status_check"
    CHECK ("status" IN ('PENDING', 'SENT', 'FAILED'))
);

-- Idempotency: at most one outbox row per (order, event). Duplicate enqueue
-- attempts hit this constraint and are treated as deduped successes.
CREATE UNIQUE INDEX "MessageOutbox_onlineOrderId_eventType_key"
  ON "MessageOutbox"("onlineOrderId", "eventType");

-- Dispatcher selection index: drain order is (status, nextAttemptAt, createdAt).
CREATE INDEX "MessageOutbox_status_nextAttemptAt_createdAt_idx"
  ON "MessageOutbox"("status", "nextAttemptAt", "createdAt");

-- Daily cap counter: scoped to (businessId, status='SENT', sentAt >= start-of-day).
CREATE INDEX "MessageOutbox_businessId_status_sentAt_idx"
  ON "MessageOutbox"("businessId", "status", "sentAt");

ALTER TABLE "MessageOutbox"
ADD CONSTRAINT "MessageOutbox_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
