# POS offline catalogue scope

## Max snapshot

**5,000 active SKUs** per store snapshot (`POS_OFFLINE_CATALOGUE_MAX`).

### Why 5,000

- IndexedDB is the offline store. A sellable DTO (no `imageUrl`, no cost/management fields) is on the order of **0.4–0.8 KB** JSON per SKU in the 1k bench.
- 5,000 × ~0.6 KB ≈ **3 MB** JSON, plus IDB overhead. That stays well under typical origin quotas and keeps snapshot parse/index work in the low tens of milliseconds on desktop (see `POS_CATALOGUE_BASELINE.md` at 1k; linear in N).
- The previous checkout hydrate included `imageUrl`. Product image URLs are long; if those URLs were ever followed or inlined, a few thousand images would blow memory. Checkout must not carry images.
- Above 5,000 SKUs the cashier still sells online via **server search / barcode** (`/api/pos/search`, `/api/pos/barcode`). Offline then covers a recency-capped working set (most recently updated 5,000), not the full back-office catalogue.

This is a **defined offline scope**, not a 10k/50k readiness claim.

## Snapshot shape

`GET /api/offline/cache-data` returns sellable DTOs only:

- id, name, sku, barcode, sellingPriceBasePence, vatRateBps, isTaxable
- promoBuyQty / promoGetQty (till pricing)
- units (no `defaultCostPence`)
- onHandBase for the requested store
- **no `imageUrl`**

Plus:

- `catalogVersion` — `max(Product.updatedAt)` ISO string for the business’s active catalogue
- `catalogueSize` — full active count
- `offlineCatalogueTruncated` — true when `catalogueSize` exceeds 5,000 and this is a full snapshot
- `updatedSince` echo when a delta was requested

`useOfflinePos` also caps writes to IndexedDB at 5,000.

## Incremental / delta (v1)

`Product.updatedAt` exists. The cache-data route accepts `?updatedSince=<ISO>` and returns rows with `updatedAt > updatedSince`, still capped at 5,000, plus the new `catalogVersion`.

**Follow-up (not in this change):** merge the delta into IndexedDB (upsert changed SKUs, delete inactive/missing IDs, keep a local `catalogVersion`). Today a full refresh still replaces the snapshot. Without that merge, `updatedSince` is safe to call but clients that only apply the delta would drop SKUs that did not change.

## Mode split

| Catalogue size | Online POS | Offline snapshot |
| --- | --- | --- |
| ≤ 2,000 | Local in-memory index (`posCatalogueMode=local`) | Full sellable snapshot |
| 2,001–5,000 | Server search/barcode (`paged`) | Full sellable snapshot |
| > 5,000 | Server search/barcode | Most recently updated 5,000 SKUs |

`posCatalogueMode=paged` (query or `POS_CATALOGUE_MODE=paged`) forces server search even for small catalogues.
