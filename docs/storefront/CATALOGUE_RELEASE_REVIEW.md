# Storefront catalogue release review — 17 October 2026

Read-only source: EL-SHADDAI SUPERMARKET, 530 published active products out of 1,312 products. Production catalogue unchanged.

## Prepared corrections

`catalogue-release-manifest.json` identifies six clear product/category mismatches, including Ginseng Toffee under Air Freshener, Fortin White Oats under Margarine, and Ideal Milk under Soap. Correct these master categories at approved release; preserve names, prices, stock and unit conversions. Do not map the whole Air Freshener category into food.

Automatic public-category defaults now prioritise exact Baby Oil, Roll-on, Tooth Paste, Tooth Brush, Toilet Roll and other specific aliases before broad oil/roll/paste substring rules. Merchant category overrides retain precedence. Existing biscuit/beverage aliases already merge redundant public categories.

## Merchant decisions still required

- 34 listings visibly combine brand/variant alternatives (for example Rambo/Oba beef and Sure/Right Guard). Confirm supplied variant or split stock by SKU. No inferred brand substitutions.
- 196 explicit-size single-listing candidates form a reviewable focused range. These are candidates, not certified-ready products: verify selling units, pack contents and availability. Keep the current published range until merchant confirmation and release approval.
- Only 28 published products have images; 502 use the existing consistent fallback. Reuse only matching verified assets. Do not fabricate branded pack shots or attach one brand image to a mixed-brand listing.
- Confirm missing B/S, M/S and S/S sizes from packaging. Do not invent grams, millilitres or pack counts.

## Release acceptance

Review the six category corrections and the focused-range manifest, verify product images against packaging, apply approved data changes, then inspect recommendations and checkout units on the resulting storefront. Catalogue cleanup cannot be marked complete while these merchant facts remain unresolved.

## Tested release preparation

`catalogue-category-corrections.sql` applies the six reviewed corrections in one guarded PostgreSQL statement. Tested against temporary fixture tables on isolated Preview: all six destination categories matched, a second application was safe, an unrelated product remained unchanged, and a changed product name rejected the entire correction with the expected stale-review error. No production data was changed.

`MERCHANT_SIGNOFF.md` lists the product decisions and missing Main Branch pickup details in a reviewable table. Existing shortcode/business contact are configured; Main Branch address, hours and pickup instructions are absent, and preparation is currently zero. Retain honest missing-information messaging until the merchant supplies these facts.
