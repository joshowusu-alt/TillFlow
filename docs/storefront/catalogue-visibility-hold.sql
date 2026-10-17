-- Optional conservative release policy: withhold these 34 reviewed listings from ONLINE ordering.
-- Apply only with explicit production release/data approval. POS, names, prices and stock are unchanged.
-- Re-running is safe. Missing/duplicate product names reject the entire statement.
DO $storefront_visibility$
DECLARE
  target_business TEXT;
  matched INTEGER;
BEGIN
  SELECT id INTO STRICT target_business FROM "Business"
  WHERE "storefrontSlug" = 'el-shaddai-supermarket' AND name = 'EL-SHADDAI SUPERMARKET';
  WITH reviewed(expected_name) AS (VALUES
      ('5 STAR / RUSH / BOSS'),
      ('ALAA /MOM''S/OBA SARDINES'),
      ('ALFA / LELE TOMATO KETCHUP (340G)'),
      ('AMA/MAAME ESI/YEBOAH RICE 5X5 / MOLLY 5X5KG'),
      ('AQUA SOFT /VIDA/ DE LORDS'),
      ('ARO/ MOK STRIP'),
      ('BALONA YOGHURT TOFFEE /ZOOM ZOOM TOFFEE'),
      ('BIGG / RIO POP TOFFEE'),
      ('BLUE DIAMOND / SWISS SPRAY'),
      ('BUTTER FINGERS /CHEESE BALLS/DOUGHATTI'),
      ('CHOCO RINGS /RING COOKIES/ CHOCO MALT BIST'),
      ('COKE /FANTA /SPRITE CAN'),
      ('COLGATE KIDS TOOTHBRUSH/ EXTRA SOFT 2+'),
      ('ENAPA / RAMBO  BAKED BEANS 425G'),
      ('EVA /PURE HEAVEN/CRUSH/KISS  WINE (1L)'),
      ('EVERYDAY RICE/ OLIVIA'),
      ('FLUFFY / FLORA  T. ROLL'),
      ('FRIDGE GUINESS CAN MALT/BB COCKTAIL / SOUR SOP'),
      ('GINNY/ A55  RICE 5X5'),
      ('GLADE PAPER/ COOL BREEZ  AIR FRESHENER'),
      ('H&H / CHANNEL/ BAMIA SUNFLOWER 5LT'),
      ('HEAVEN/ AIRPRO CAMPHOR S/S'),
      ('IDEAL FRUITY / HI MILK SACHET'),
      ('JASMINE RICE 25 POUNDS / 11 KGS'),
      ('LEAP / ROSA TOMATO 2.2KG'),
      ('LOVAN / DUBAI WAFER B/S'),
      ('MILKY MAGIC M/S /GINGER MAGIC'),
      ('OTHELO/SULTANA / BELLA  SARDINE'),
      ('OUT/OSCAR / TIGERHEAD/HOLY MATCHES/VOLCANO'),
      ('OYE /OLE /KLEO SARDINES'),
      ('RAMBO BEEF PATE (400G) /OBA BEEF'),
      ('ROCH /GLENDY SARDINE/NUREEN SARDINE'),
      ('SURE SPRAY /RIGHT GUARD'),
      ('U- FRESH BOX CHOCO / SOYAMILK')
  ), unique_candidates AS (
    SELECT reviewed.expected_name
    FROM reviewed JOIN "Product" p ON p.name = reviewed.expected_name AND p."businessId" = target_business
    GROUP BY reviewed.expected_name HAVING COUNT(*) = 1
  )
  UPDATE "Product" p SET "storefrontPublished" = false
  FROM unique_candidates candidate
  WHERE p.name = candidate.expected_name AND p."businessId" = target_business;
  GET DIAGNOSTICS matched = ROW_COUNT;
  IF matched <> 34 THEN
    RAISE EXCEPTION 'Visibility review is stale: expected 34 unique products; found %. No visibility changes applied.', matched;
  END IF;
END;
$storefront_visibility$;
