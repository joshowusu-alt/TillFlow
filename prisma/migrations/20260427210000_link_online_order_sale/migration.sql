ALTER TABLE "OnlineOrder" ADD COLUMN "salesInvoiceId" TEXT;
ALTER TABLE "OnlineOrder" ADD COLUMN "refundStatus" TEXT;
ALTER TABLE "OnlineOrder" ADD COLUMN "refundedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "OnlineOrder_salesInvoiceId_key" ON "OnlineOrder"("salesInvoiceId");

ALTER TABLE "OnlineOrder"
ADD CONSTRAINT "OnlineOrder_salesInvoiceId_fkey"
FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
