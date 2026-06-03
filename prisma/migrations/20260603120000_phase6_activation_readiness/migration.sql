-- Phase 6 Slice 1: activation readiness fields (TillFlow + Control plane)

ALTER TABLE "Business" ADD COLUMN "businessCategory" TEXT;
ALTER TABLE "Business" ADD COLUMN "activationStatus" TEXT NOT NULL DEFAULT 'GETTING_STARTED';
ALTER TABLE "Business" ADD COLUMN "setupProgressPct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Business" ADD COLUMN "ownerLastDashboardViewAt" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN "ownerLastReportViewAt" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN "trialAcknowledgedAt" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN "activationStuckReason" TEXT;
ALTER TABLE "Business" ADD COLUMN "activationNextAction" TEXT;
ALTER TABLE "Business" ADD COLUMN "activationSnapshotAt" TIMESTAMP(3);

ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

ALTER TABLE "ControlBusinessProfile" ADD COLUMN "onboardingStage" TEXT;
ALTER TABLE "ControlBusinessProfile" ADD COLUMN "stuckReason" TEXT;
ALTER TABLE "ControlBusinessProfile" ADD COLUMN "activationScore" INTEGER;
ALTER TABLE "ControlBusinessProfile" ADD COLUMN "nextRecommendedAction" TEXT;
ALTER TABLE "ControlBusinessProfile" ADD COLUMN "churnRisk" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ControlBusinessProfile" ADD COLUMN "referralSource" TEXT;
ALTER TABLE "ControlBusinessProfile" ADD COLUMN "referredBy" TEXT;
ALTER TABLE "ControlBusinessProfile" ADD COLUMN "referralStatus" TEXT;
ALTER TABLE "ControlBusinessProfile" ADD COLUMN "assignedAgentName" TEXT;
ALTER TABLE "ControlBusinessProfile" ADD COLUMN "productCountSnapshot" INTEGER;
ALTER TABLE "ControlBusinessProfile" ADD COLUMN "transactionCountSnapshot" INTEGER;
ALTER TABLE "ControlBusinessProfile" ADD COLUMN "lastSaleAt" TIMESTAMP(3);
ALTER TABLE "ControlBusinessProfile" ADD COLUMN "setupCallCompletedAt" TIMESTAMP(3);
ALTER TABLE "ControlBusinessProfile" ADD COLUMN "firstSaleMarkedAt" TIMESTAMP(3);
ALTER TABLE "ControlBusinessProfile" ADD COLUMN "paymentFollowUpNeeded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ControlBusinessProfile" ADD COLUMN "openSupportIssueCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "ControlBusinessProfile_onboardingStage_idx" ON "ControlBusinessProfile"("onboardingStage");
CREATE INDEX "ControlBusinessProfile_stuckReason_idx" ON "ControlBusinessProfile"("stuckReason");
CREATE INDEX "ControlBusinessProfile_churnRisk_idx" ON "ControlBusinessProfile"("churnRisk");
