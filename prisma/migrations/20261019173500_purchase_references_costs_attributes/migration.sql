ALTER TABLE "PurchaseInvoice" ADD COLUMN "supplierInvoiceNumber" TEXT;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "additionalCostPence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "additionalCostTreatment" TEXT NOT NULL DEFAULT 'EXPENSE';
ALTER TABLE "PurchaseInvoice" ADD COLUMN "additionalCostNote" TEXT;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "linkedCostExpenseId" TEXT;
ALTER TABLE "PurchaseInvoiceLine" ADD COLUMN "allocatedCostPence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "attributesJson" TEXT;
CREATE INDEX "PurchaseInvoice_businessId_supplierId_supplierInvoiceNumber_idx" ON "PurchaseInvoice"("businessId", "supplierId", "supplierInvoiceNumber");
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_linkedCostExpenseId_fkey" FOREIGN KEY ("linkedCostExpenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
