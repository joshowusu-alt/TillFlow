CREATE TABLE "ProductDivision" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "ProductDivision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductDivision_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductDivision_categoryId_name_key" ON "ProductDivision"("categoryId", "name");
CREATE INDEX "ProductDivision_businessId_idx" ON "ProductDivision"("businessId");
CREATE TABLE "ProductGroup" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "divisionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "ProductGroup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductGroup_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "ProductDivision"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductGroup_divisionId_name_key" ON "ProductGroup"("divisionId", "name");
CREATE INDEX "ProductGroup_businessId_idx" ON "ProductGroup"("businessId");
ALTER TABLE "Product" ADD COLUMN "groupId" TEXT;
CREATE INDEX "Product_groupId_idx" ON "Product"("groupId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
