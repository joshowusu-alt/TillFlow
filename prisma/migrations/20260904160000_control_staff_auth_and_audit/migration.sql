-- Phase 0: adopt ControlStaff auth columns and ControlAuditLog created outside Prisma history,
-- then add sessionVersion + payment/audit idempotency keys.
-- Safe on empty DBs, current-schema clones, and DBs where raw DDL already created the objects.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ControlStaff'
      AND column_name = 'passwordHash'
      AND data_type NOT IN ('text', 'character varying')
  ) THEN
    RAISE EXCEPTION 'ControlStaff.passwordHash exists with an incompatible type';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ControlAuditLog'
      AND column_name = 'metadata'
      AND data_type NOT IN ('text', 'character varying', 'json', 'jsonb')
  ) THEN
    RAISE EXCEPTION 'ControlAuditLog.metadata exists with an incompatible type';
  END IF;
END $$;

ALTER TABLE "ControlStaff"
  ADD COLUMN IF NOT EXISTS "passwordHash" TEXT,
  ADD COLUMN IF NOT EXISTS "passwordSetAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "ControlAuditLog" (
  "id" TEXT NOT NULL,
  "staffId" TEXT,
  "staffEmail" TEXT NOT NULL,
  "staffRole" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "businessId" TEXT,
  "summary" TEXT NOT NULL,
  "metadata" TEXT,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ControlAuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ControlAuditLog"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ControlAuditLog_idempotencyKey_key"
  ON "ControlAuditLog"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "ControlAuditLog_businessId_createdAt_idx"
  ON "ControlAuditLog"("businessId", "createdAt");

CREATE INDEX IF NOT EXISTS "ControlAuditLog_staffId_createdAt_idx"
  ON "ControlAuditLog"("staffId", "createdAt");

CREATE INDEX IF NOT EXISTS "ControlAuditLog_action_createdAt_idx"
  ON "ControlAuditLog"("action", "createdAt");

ALTER TABLE "ControlPayment"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ControlPayment_idempotencyKey_key"
  ON "ControlPayment"("idempotencyKey");

ALTER TABLE "ControlSubscription"
  ALTER COLUMN "status" SET DEFAULT 'TRIAL_ACTIVE';
