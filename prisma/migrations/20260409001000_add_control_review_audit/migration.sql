ALTER TABLE "ControlBusinessProfile"
ADD COLUMN "reviewedByStaffId" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE INDEX "ControlBusinessProfile_reviewedByStaffId_idx" ON "ControlBusinessProfile"("reviewedByStaffId");

ALTER TABLE "ControlBusinessProfile"
ADD CONSTRAINT "ControlBusinessProfile_reviewedByStaffId_fkey"
FOREIGN KEY ("reviewedByStaffId") REFERENCES "ControlStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;