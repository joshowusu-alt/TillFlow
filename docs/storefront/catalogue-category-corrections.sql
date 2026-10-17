-- Reviewed storefront category corrections only. No price, stock, units, names or visibility changes.
-- Run only after the storefront production release/data approval. Do not add to automatic migrations.
-- Re-running is safe; changed names/categories cause an all-or-nothing rejection.
DO $storefront_catalogue$
DECLARE
  target_business TEXT;
  matched INTEGER;
BEGIN
  SELECT id INTO STRICT target_business FROM "Business"
  WHERE "storefrontSlug" = 'el-shaddai-supermarket' AND name = 'EL-SHADDAI SUPERMARKET';

  WITH corrections(expected_name, old_category, new_category) AS (
    VALUES
      ('GINSENG TOFFEE', 'AIR FRESHENER', 'TOFFEE'),
      ('FORTIN WHITE OATS', 'MARGARINE', 'CEREAL'),
      ('IDEAL MILK TIN S/S (160G) UNIT', 'SOAP', 'MILK'),
      ('KIVO GOOD TIME GARI MIX B/S', 'DRINK', 'GARI'),
      ('GLADE SPRAY (300ML) SPRAY', NULL, 'AIR FRESHENER'),
      ('SURE SPRAY /RIGHT GUARD', 'AIR FRESHENER', 'PERSONAL CARE')
  ), unique_candidates AS (
    SELECT fix.expected_name
    FROM corrections fix JOIN "Product" p ON p.name = fix.expected_name AND p."businessId" = target_business
    GROUP BY fix.expected_name HAVING COUNT(*) = 1
  ), validated AS (
    SELECT p.id, destination.id AS category_id
    FROM corrections fix
    JOIN unique_candidates checked ON checked.expected_name = fix.expected_name
    JOIN "Product" p ON p."businessId" = target_business AND p.name = fix.expected_name
    LEFT JOIN "Category" original ON original.id = p."categoryId" AND original."businessId" = target_business
    JOIN "Category" destination ON destination."businessId" = target_business AND destination.name = fix.new_category
    WHERE original.name IS NOT DISTINCT FROM fix.old_category OR original.name = fix.new_category
  )
  UPDATE "Product" p SET "categoryId" = validated.category_id
  FROM validated WHERE p.id = validated.id AND p."businessId" = target_business;
  GET DIAGNOSTICS matched = ROW_COUNT;
  IF matched <> 6 THEN
    RAISE EXCEPTION 'Catalogue review is stale: expected six validated products; found %. No corrections applied.', matched;
  END IF;
END;
$storefront_catalogue$;
