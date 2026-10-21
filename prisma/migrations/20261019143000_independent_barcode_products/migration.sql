DROP INDEX IF EXISTS "Product_businessId_name_publisher_edition_key";
DROP INDEX IF EXISTS "Product_title_version_case_key";
CREATE INDEX "Product_businessId_name_publisher_edition_idx" ON "Product"("businessId", "name", "publisher", "edition");
