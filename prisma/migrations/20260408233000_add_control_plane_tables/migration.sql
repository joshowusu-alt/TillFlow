CREATE TABLE "ControlStaff" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'ACCOUNT_MANAGER',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ControlStaff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ControlStaff_email_key" ON "ControlStaff"("email");

CREATE TABLE "ControlBusinessProfile" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "ownerName" TEXT,
  "ownerPhone" TEXT,
  "ownerEmail" TEXT,
  "assignedManagerId" TEXT,
  "supportStatus" TEXT NOT NULL DEFAULT 'HEALTHY',
  "lastActivityAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ControlBusinessProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ControlBusinessProfile_businessId_key" ON "ControlBusinessProfile"("businessId");
CREATE INDEX "ControlBusinessProfile_assignedManagerId_idx" ON "ControlBusinessProfile"("assignedManagerId");
CREATE INDEX "ControlBusinessProfile_supportStatus_idx" ON "ControlBusinessProfile"("supportStatus");

CREATE TABLE "ControlSubscription" (
  "id" TEXT NOT NULL,
  "controlBusinessId" TEXT NOT NULL,
  "purchasedPlan" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "billingCadence" TEXT NOT NULL DEFAULT 'MONTHLY',
  "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextDueDate" TIMESTAMP(3),
  "lastPaymentDate" TIMESTAMP(3),
  "readOnlyAt" TIMESTAMP(3),
  "effectivePlanOverride" TEXT,
  "gracePolicyVersion" TEXT,
  "monthlyValuePence" INTEGER NOT NULL DEFAULT 0,
  "outstandingAmountPence" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ControlSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ControlSubscription_controlBusinessId_key" ON "ControlSubscription"("controlBusinessId");
CREATE INDEX "ControlSubscription_purchasedPlan_status_idx" ON "ControlSubscription"("purchasedPlan", "status");
CREATE INDEX "ControlSubscription_nextDueDate_idx" ON "ControlSubscription"("nextDueDate");

CREATE TABLE "ControlPayment" (
  "id" TEXT NOT NULL,
  "controlBusinessId" TEXT NOT NULL,
  "amountPence" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GHS',
  "paidAt" TIMESTAMP(3) NOT NULL,
  "method" TEXT NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "receivedByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ControlPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ControlPayment_controlBusinessId_paidAt_idx" ON "ControlPayment"("controlBusinessId", "paidAt");
CREATE INDEX "ControlPayment_receivedByStaffId_idx" ON "ControlPayment"("receivedByStaffId");

CREATE TABLE "ControlNote" (
  "id" TEXT NOT NULL,
  "controlBusinessId" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'GENERAL',
  "note" TEXT NOT NULL,
  "createdByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ControlNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ControlNote_controlBusinessId_createdAt_idx" ON "ControlNote"("controlBusinessId", "createdAt");
CREATE INDEX "ControlNote_createdByStaffId_idx" ON "ControlNote"("createdByStaffId");

ALTER TABLE "ControlBusinessProfile"
ADD CONSTRAINT "ControlBusinessProfile_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ControlBusinessProfile"
ADD CONSTRAINT "ControlBusinessProfile_assignedManagerId_fkey"
FOREIGN KEY ("assignedManagerId") REFERENCES "ControlStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ControlSubscription"
ADD CONSTRAINT "ControlSubscription_controlBusinessId_fkey"
FOREIGN KEY ("controlBusinessId") REFERENCES "ControlBusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ControlPayment"
ADD CONSTRAINT "ControlPayment_controlBusinessId_fkey"
FOREIGN KEY ("controlBusinessId") REFERENCES "ControlBusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ControlPayment"
ADD CONSTRAINT "ControlPayment_receivedByStaffId_fkey"
FOREIGN KEY ("receivedByStaffId") REFERENCES "ControlStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ControlNote"
ADD CONSTRAINT "ControlNote_controlBusinessId_fkey"
FOREIGN KEY ("controlBusinessId") REFERENCES "ControlBusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ControlNote"
ADD CONSTRAINT "ControlNote_createdByStaffId_fkey"
FOREIGN KEY ("createdByStaffId") REFERENCES "ControlStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;