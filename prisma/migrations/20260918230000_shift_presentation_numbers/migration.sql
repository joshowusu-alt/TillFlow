-- Additive Preview-safe shift presentation numbers.
-- Historic nulls remain valid. No backfill. No Production impact from this file alone.

ALTER TABLE "Shift" ADD COLUMN "shiftNumber" TEXT;
CREATE UNIQUE INDEX "Shift_tillId_shiftNumber_key" ON "Shift"("tillId", "shiftNumber");
