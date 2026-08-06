# TillFlow Migration Framework — Phase 1 Contract (v1)

**Status:** Locked for P0 foundation  
**Contract version:** `1`  
**Scope:** One atomic package = suppliers + products + opening stock

## Package identity

Package identity is **not** derived from filenames.

A package must carry:

| Field | Rule |
|---|---|
| `contractVersion` | `"1"` |
| `sourceSystemKey` | Normalised stable namespace (`[a-z0-9][a-z0-9_-]{1,62}`) |
| `sourceBusinessKey` | Source-system business identity (NFC, ≤128) |
| `reportingCurrency` | ISO 4217 (3 letters) |
| `packageAsOfDate` | `YYYY-MM-DD` |
| Three file checksums | `SUPPLIERS`, `PRODUCTS`, `OPENING_STOCK` |
| Branch mappings | Every `sourceBranchKey` → same-business `Store` |

### Source branch key canonicalisation

Approval-material `sourceBranchKey` identity (manifest + duplicate policy) uses one shared rule:

1. require a string;
2. trim surrounding whitespace;
3. Unicode NFC;
4. locale-independent lowercase;
5. reject empty;
6. max length 128 (on the NFC-trimmed form).

`HQ`, `hq`, and ` HQ ` share one identity. Target `storeId` values are not case-folded.

### Package file completeness

The database guarantees **at most one** file per `(packageId, entityType)`.  
P1 validation/approval must still require **exactly** the three Phase 1 entity files transactionally.

## Suppliers file

Required: `sourceSupplierKey`, `supplierName`  
Optional: `phone`, `email`, `address`, `taxRegistrationId`, `active`  
**Prohibited:** supplier balances and all Phase 1 excluded entities

## Products file

Required: `sourceProductKey`, `productName`, `costPrice`, `sellingPrice`, `active`  
Optional: `sku`, `barcode`, `category`, `unit`, `taxTreatment`, `defaultSupplierSourceKey`

Money fields use ordinary decimal major units (e.g. `12.50`). TillFlow converts to integer minor units.

## Opening stock file

Required: `sourceProductKey`, `sourceBranchKey`, `quantity`, `unitCost`, `asOfDate`  
Optional: `sourceStockValue` (reconciliation control only)

Rules:

- Zero quantity allowed
- Negative quantity prohibited
- Negative unit cost prohibited
- Authoritative value = `quantity × unitCost` (integer minor units)
- If `sourceStockValue` is supplied, it must exactly match the calculated value after conversion

## Excluded from Phase 1

Customers, debtor balances, supplier balances, sales/purchase history, cash, MoMo, shifts, loyalty, historic journals, and other operational transactions.

## Existing-record safety

- No fuzzy matching
- SKU/barcode conflicts are blocking
- Ambiguous matches are blocking
- Deleted mapped targets → `MAPPED_TARGET_MISSING`
- No silent retargeting
- Existing inventory or trading activity blocks opening-stock import (no Owner override in Phase 1)
