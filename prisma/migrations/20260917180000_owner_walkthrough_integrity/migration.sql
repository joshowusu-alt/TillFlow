-- Additive owner-walkthrough integrity fields.
-- Forward-only: nullable presentation numbers, stocktake count state,
-- adjustment reversal link, and cash-variance investigation.
-- No backfill. No rewrite of historic money or stock rows.

ALTER TABLE "Shift" ADD COLUMN "closureNumber" TEXT;

ALTER TABLE "StockAdjustment" ADD COLUMN "transactionNumber" TEXT;
ALTER TABLE "StockAdjustment" ADD COLUMN "reversalOfId" TEXT;
ALTER TABLE "StockAdjustment" ADD COLUMN "reversalReason" TEXT;
CREATE UNIQUE INDEX "StockAdjustment_reversalOfId_key" ON "StockAdjustment"("reversalOfId");

ALTER TABLE "PurchaseInvoice" ADD COLUMN "transactionNumber" TEXT;
CREATE UNIQUE INDEX "PurchaseInvoice_businessId_transactionNumber_key"
  ON "PurchaseInvoice"("businessId", "transactionNumber");

ALTER TABLE "PurchasePayment" ADD COLUMN "transactionNumber" TEXT;
CREATE UNIQUE INDEX "PurchasePayment_businessId_transactionNumber_key"
  ON "PurchasePayment"("businessId", "transactionNumber");

ALTER TABLE "Expense" ADD COLUMN "transactionNumber" TEXT;
ALTER TABLE "Expense" ADD COLUMN "sourceAdjustmentId" TEXT;
CREATE UNIQUE INDEX "Expense_businessId_transactionNumber_key"
  ON "Expense"("businessId", "transactionNumber");
CREATE UNIQUE INDEX "Expense_sourceAdjustmentId_key"
  ON "Expense"("sourceAdjustmentId");

ALTER TABLE "ExpensePayment" ADD COLUMN "transactionNumber" TEXT;
CREATE UNIQUE INDEX "ExpensePayment_businessId_transactionNumber_key"
  ON "ExpensePayment"("businessId", "transactionNumber");

ALTER TABLE "Stocktake" ADD COLUMN "transactionNumber" TEXT;

ALTER TABLE "StocktakeLine" ADD COLUMN "countState" TEXT;
ALTER TABLE "StocktakeLine" ADD COLUMN "countedAt" TIMESTAMP(3);
ALTER TABLE "StocktakeLine" ADD COLUMN "countedByUserId" TEXT;
CREATE INDEX "StocktakeLine_countState_idx" ON "StocktakeLine"("countState");
ALTER TABLE "StocktakeLine"
  ADD CONSTRAINT "StocktakeLine_countedByUserId_fkey"
  FOREIGN KEY ("countedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CashVarianceInvestigation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedReviewerUserId" TEXT,
    "variancePence" INTEGER NOT NULL,
    "cashierExplanation" TEXT,
    "evidencePath" TEXT,
    "managerResolution" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "transactionNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashVarianceInvestigation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashVarianceInvestigation_shiftId_key"
  ON "CashVarianceInvestigation"("shiftId");
CREATE UNIQUE INDEX "CashVarianceInvestigation_businessId_transactionNumber_key"
  ON "CashVarianceInvestigation"("businessId", "transactionNumber");
CREATE INDEX "CashVarianceInvestigation_businessId_status_createdAt_idx"
  ON "CashVarianceInvestigation"("businessId", "status", "createdAt");

ALTER TABLE "CashVarianceInvestigation"
  ADD CONSTRAINT "CashVarianceInvestigation_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashVarianceInvestigation"
  ADD CONSTRAINT "CashVarianceInvestigation_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "Shift"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashVarianceInvestigation"
  ADD CONSTRAINT "CashVarianceInvestigation_assignedReviewerUserId_fkey"
  FOREIGN KEY ("assignedReviewerUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CashVarianceInvestigation"
  ADD CONSTRAINT "CashVarianceInvestigation_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
