-- Preview-only until Stage 1 acceptance and explicit rollout approval.
ALTER TABLE "Product" ADD COLUMN "publisher" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "edition" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_barcode_key";
DROP INDEX IF EXISTS "Product_barcode_key";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_businessId_name_key";
DROP INDEX IF EXISTS "Product_businessId_name_key";
CREATE UNIQUE INDEX "Product_businessId_barcode_key" ON "Product"("businessId", "barcode");
CREATE UNIQUE INDEX "Product_businessId_name_publisher_edition_key" ON "Product"("businessId", "name", "publisher", "edition");
CREATE UNIQUE INDEX "Product_title_version_case_key" ON "Product"("businessId", lower("name"), lower("publisher"), lower("edition"));
CREATE UNIQUE INDEX "Product_id_businessId_key" ON "Product"("id", "businessId");
CREATE TABLE "ProductBarcode" (
  "businessId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  CONSTRAINT "ProductBarcode_pkey" PRIMARY KEY ("businessId", "code"),
  CONSTRAINT "ProductBarcode_productId_businessId_fkey" FOREIGN KEY ("productId", "businessId") REFERENCES "Product"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProductBarcode_productId_idx" ON "ProductBarcode"("productId");
INSERT INTO "ProductBarcode" ("businessId", "code", "productId") SELECT "businessId", "barcode", "id" FROM "Product" WHERE "barcode" IS NOT NULL;

-- Keep every existing primary-barcode writer (including bulk imports) in the same
-- tenant registry as aliases. Its primary key serialises concurrent claims.
CREATE FUNCTION sync_product_primary_barcode() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."barcode" IS DISTINCT FROM NEW."barcode" THEN
    DELETE FROM "ProductBarcode" WHERE "businessId" = OLD."businessId" AND "code" = OLD."barcode" AND "productId" = OLD."id";
  END IF;
  IF NEW."barcode" IS NOT NULL THEN
    INSERT INTO "ProductBarcode" ("businessId", "code", "productId") VALUES (NEW."businessId", NEW."barcode", NEW."id")
    ON CONFLICT ("businessId", "code") DO UPDATE SET "productId" = "ProductBarcode"."productId"
    WHERE "ProductBarcode"."productId" = EXCLUDED."productId";
    IF NOT FOUND THEN RAISE EXCEPTION 'Barcode is already assigned in this business' USING ERRCODE = '23505'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER product_primary_barcode_registry AFTER INSERT OR UPDATE OF "barcode" ON "Product" FOR EACH ROW EXECUTE FUNCTION sync_product_primary_barcode();
