ALTER TABLE "Business" ADD COLUMN "shiftCloseApprovalThresholdPence" INTEGER NOT NULL DEFAULT 5000;
ALTER TABLE "CashVarianceInvestigation" ADD COLUMN "reviewedByUserId" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3), ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "CashVarianceInvestigation" ADD CONSTRAINT "CashVarianceInvestigation_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
