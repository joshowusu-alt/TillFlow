# Storefront merchant decisions

Production is unchanged. These are the facts and catalogue decisions needed for release; no passwords or API keys are needed here.

## Pickup details

- The saved business address now supplies pickup guidance for single-branch shops, consistently at checkout and on the order page. Confirm it remains accurate; add a more precise landmark if needed.
- Opening days/hours: **needed**, or explicitly keep the honest “hours not provided; contact the store” message.
- Preparation estimate: **needed**, or keep “wait for ready confirmation” without inventing a duration.
- Existing merchant shortcode and business contact are configured. Confirm they remain the intended customer payment/contact details; do not send account credentials.

## Six prepared category corrections

The release SQL is tested, repeatable and rejects stale product names/categories. Apply only with release/data approval. It changes categories only.

| Product | Current category | Correct category |
| --- | --- | --- |
| GINSENG TOFFEE | AIR FRESHENER | TOFFEE |
| FORTIN WHITE OATS | MARGARINE | CEREAL |
| IDEAL MILK TIN S/S (160G) UNIT | SOAP | MILK |
| KIVO GOOD TIME GARI MIX B/S | DRINK | GARI |
| GLADE SPRAY (300ML) SPRAY | Uncategorised | AIR FRESHENER |
| SURE SPRAY /RIGHT GUARD | AIR FRESHENER | PERSONAL CARE |

## Listings requiring a product/variant check

Recommended release policy: hide genuinely ambiguous listings from online ordering until the supplied product is confirmed; keep POS stock and sales available. Some slash notation may describe one product, so verify it rather than assuming every slash is a different brand. No automatic substitutions.

| Listing | Confirmed supplied product, size and selling unit |
| --- | --- |
| 5 STAR / RUSH / BOSS | Pending |
| ALAA /MOM'S/OBA SARDINES | Pending |
| ALFA / LELE TOMATO KETCHUP (340G) | Pending |
| AMA/MAAME ESI/YEBOAH RICE 5X5 / MOLLY 5X5KG | Pending |
| AQUA SOFT /VIDA/ DE LORDS | Pending |
| ARO/ MOK STRIP | Pending |
| BALONA YOGHURT TOFFEE /ZOOM ZOOM TOFFEE | Pending |
| BIGG / RIO POP TOFFEE | Pending |
| BLUE DIAMOND / SWISS SPRAY | Pending |
| BUTTER FINGERS /CHEESE BALLS/DOUGHATTI | Pending |
| CHOCO RINGS /RING COOKIES/ CHOCO MALT BIST | Pending |
| COKE /FANTA /SPRITE CAN | Pending |
| COLGATE KIDS TOOTHBRUSH/ EXTRA SOFT 2+ | Pending |
| ENAPA / RAMBO  BAKED BEANS 425G | Pending |
| EVA /PURE HEAVEN/CRUSH/KISS  WINE (1L) | Pending |
| EVERYDAY RICE/ OLIVIA | Pending |
| FLUFFY / FLORA  T. ROLL | Pending |
| FRIDGE GUINESS CAN MALT/BB COCKTAIL / SOUR SOP | Pending |
| GINNY/ A55  RICE 5X5 | Pending |
| GLADE PAPER/ COOL BREEZ  AIR FRESHENER | Pending |
| H&H / CHANNEL/ BAMIA SUNFLOWER 5LT | Pending |
| HEAVEN/ AIRPRO CAMPHOR S/S | Pending |
| IDEAL FRUITY / HI MILK SACHET | Pending |
| JASMINE RICE 25 POUNDS / 11 KGS | Pending |
| LEAP / ROSA TOMATO 2.2KG | Pending |
| LOVAN / DUBAI WAFER B/S | Pending |
| MILKY MAGIC M/S /GINGER MAGIC | Pending |
| OTHELO/SULTANA / BELLA  SARDINE | Pending |
| OUT/OSCAR / TIGERHEAD/HOLY MATCHES/VOLCANO | Pending |
| OYE /OLE /KLEO SARDINES | Pending |
| RAMBO BEEF PATE (400G) /OBA BEEF | Pending |
| ROCH /GLENDY SARDINE/NUREEN SARDINE | Pending |
| SURE SPRAY /RIGHT GUARD | Pending |
| U- FRESH BOX CHOCO / SOYAMILK | Pending |

The 196 explicit-size range candidates are in `catalogue-release-manifest.json`. They are a shortlist, not an instruction to unpublish everything else. Retain consistent image fallbacks for products without a verified matching photograph.

## Phone/staff acceptance

Use the isolated Preview shop and existing Preview sign-in; no real payment or SMS is required.

1. On a small phone, search for a product, open details, add it, search for another, then open the basket. Confirm both remain and no sideways page scrolling appears.
2. Open checkout, bring up the keyboard, enter fictional customer details and rotate the phone. Confirm the fields, totals, pickup information and place-order button remain usable. Do not send money.
3. With a cashier and manager signed in independently, place one fictional Preview order. Both should see the persistent alert; cashier preparation/collection remains available while payment/refund controls stay manager-only.
4. Enable arrival sound through its button and confirm a new order is audible on the real device. A full browser reload may require another gesture before audio can play.
5. Interrupt connectivity and restore it. The alert must indicate stale status and recover; retrying checkout must return the same order.

SMS testing is deliberately deferred until after the approved production release: one authorised recipient, at most five messages.
