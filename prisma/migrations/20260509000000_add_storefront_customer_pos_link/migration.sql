-- Migration: add_storefront_customer_pos_link
ALTER TABLE "StorefrontCustomer" ADD COLUMN "posCustomerId" TEXT;
ALTER TABLE "StorefrontCustomer"
  ADD CONSTRAINT "StorefrontCustomer_posCustomerId_fkey"
  FOREIGN KEY ("posCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL;
CREATE INDEX "StorefrontCustomer_businessId_posCustomerId_idx"
  ON "StorefrontCustomer"("businessId", "posCustomerId");
