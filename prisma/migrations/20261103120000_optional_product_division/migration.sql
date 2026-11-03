-- Products may stop at a division without requiring a group.
ALTER TABLE "Product" ADD COLUMN "divisionId" TEXT REFERENCES "ProductDivision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Product_divisionId_idx" ON "Product"("divisionId");
