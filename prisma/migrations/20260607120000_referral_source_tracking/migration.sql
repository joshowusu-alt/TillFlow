-- Slice 7: referral / source tracking on control business profile
ALTER TABLE "ControlBusinessProfile"
  ADD COLUMN IF NOT EXISTS "sourceChannel" TEXT,
  ADD COLUMN IF NOT EXISTS "referredByName" TEXT,
  ADD COLUMN IF NOT EXISTS "referredByPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "referralNextFollowUpAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "referralNotes" TEXT;

CREATE INDEX IF NOT EXISTS "ControlBusinessProfile_referralSource_idx"
  ON "ControlBusinessProfile"("referralSource");
CREATE INDEX IF NOT EXISTS "ControlBusinessProfile_referralStatus_idx"
  ON "ControlBusinessProfile"("referralStatus");
CREATE INDEX IF NOT EXISTS "ControlBusinessProfile_assignedAgentName_idx"
  ON "ControlBusinessProfile"("assignedAgentName");
