-- Slice 5: Tish Group support issue tracking
CREATE TABLE "ControlSupportIssue" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdByStaffId" TEXT,
    "createdByMerchantUserId" TEXT,
    "assignedStaffId" TEXT,
    "assignedAgentName" TEXT,
    "issueType" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerName" TEXT,
    "ownerPhone" TEXT,
    "source" TEXT NOT NULL DEFAULT 'CONTROL',
    "relatedRoute" TEXT,
    "attachmentUrl" TEXT,
    "nextAction" TEXT,
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlSupportIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ControlSupportIssueNote" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlSupportIssueNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ControlSupportIssue_businessId_status_idx" ON "ControlSupportIssue"("businessId", "status");
CREATE INDEX "ControlSupportIssue_status_priority_idx" ON "ControlSupportIssue"("status", "priority");
CREATE INDEX "ControlSupportIssue_assignedStaffId_idx" ON "ControlSupportIssue"("assignedStaffId");
CREATE INDEX "ControlSupportIssue_createdAt_idx" ON "ControlSupportIssue"("createdAt");
CREATE INDEX "ControlSupportIssueNote_issueId_createdAt_idx" ON "ControlSupportIssueNote"("issueId", "createdAt");

ALTER TABLE "ControlSupportIssue" ADD CONSTRAINT "ControlSupportIssue_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ControlSupportIssue" ADD CONSTRAINT "ControlSupportIssue_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "ControlStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ControlSupportIssue" ADD CONSTRAINT "ControlSupportIssue_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "ControlStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ControlSupportIssueNote" ADD CONSTRAINT "ControlSupportIssueNote_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ControlSupportIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ControlSupportIssueNote" ADD CONSTRAINT "ControlSupportIssueNote_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "ControlStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
