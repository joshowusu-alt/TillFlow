ALTER TABLE "PurchaseInvoice" ADD COLUMN "receiptDocumentType" TEXT NOT NULL DEFAULT 'INVOICE', ADD COLUMN "invoiceReceivedAt" TIMESTAMP(3), ADD COLUMN "discountBps" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "discountPence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseInvoiceLine" ADD COLUMN "discountBps" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "discountPence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseDocument" ADD COLUMN "documentKind" TEXT NOT NULL DEFAULT 'INVOICE';
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_receiptDocumentType_check" CHECK ("receiptDocumentType" IN ('INVOICE','DELIVERY_NOTE')), ADD CONSTRAINT "PurchaseInvoice_discount_check" CHECK ("discountBps" BETWEEN 0 AND 10000 AND "discountPence" >= 0);
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_discount_check" CHECK ("discountBps" BETWEEN 0 AND 10000 AND "discountPence" >= 0);
ALTER TABLE "PurchaseDocument" ADD CONSTRAINT "PurchaseDocument_documentKind_check" CHECK ("documentKind" IN ('INVOICE','DELIVERY_NOTE'));
