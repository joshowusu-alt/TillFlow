# POS catalogue baseline

Generated: 2026-08-30T18:25:30.858Z

Environment: local process (in-memory + optional SQLite).
These timings are **not** Ghana-network or hosted-Postgres evidence. Do **not** claim 10k/50k POS readiness from this file.

## Measurements

| size | source | productCount | sellableJsonBytes | currentJsonBytes | jsonReductionPct | indexBuildP50Ms | indexBuildP95Ms | searchP50Ms | searchP95Ms | barcodeP50Ms | barcodeP95Ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1000 | in-memory-synthetic | 1000 | 340141 | 475087 | 28.4 | 0.61 | 2.79 | 0.03 | 0.14 | 0 | 0 |
| 1000 | local-sqlite | 1000 | 391146 | 531146 | 26.4 | 1.46 | 2.67 | 0.04 | 0.27 | 0 | 0 |

SQLite select timings at 1k (same machine): full/current DTO query **75 ms**, sellable select **55 ms**. Barcode lookup is a Map get (sub-millisecond).

## Payload notes

- **Current DTO** includes imageUrl, categoryId, and defaultCostPence (the previous PosBoard hydrate shape).
- **Sellable DTO** is checkout-only: id, name, sku, barcode, price, unit, onHand, tax/promo flags. No images.
- JSON byte sizes are UTF-8 JSON.stringify of the full array.

## Follow-up

- 10k / 50k remain unproven on this checkout path. Server search + paged mode exist; measure hosted Postgres before claiming readiness.
- Incremental IDB merge on updatedSince is documented in POS_OFFLINE_CATALOGUE_SCOPE.md.
