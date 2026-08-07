# Migration P1 Slice 2B — locked contract

**Status:** Locked for implementation  
**Baseline:** `2a1e9140898877217a9ecdf2843df41faac0474a`  
**Parent:** Phase 1 Contract v1 + Slice 2A  
**Schema change:** None authorised (reuse `MigrationValidationRun`)

## User outcome

An Owner or Manager of the session business can validate a Phase 1 package whose three entity files are finalised. Validation is **read-only** and **source-neutral**: it streams private Blob bytes, verifies checksums, applies structural and semantic rules, persists a bounded `MigrationValidationRun`, and atomically transitions the package to `VALIDATED` or `VALIDATION_FAILED`.

No products, suppliers, stock, tills, shifts, sales, purchases, payments, or accounting entries are created or mutated.

## Entry conditions

All must hold:

1. Authenticated session; role is `OWNER` or `MANAGER`.
2. Package id resolves under **session** `businessId` only (client `businessId` ignored/rejected).
3. Caller supplies positive integer `expectedVersion` matching current package version (CAS).
4. Package status is pre-approval mutable and validation-eligible:
   - `DRAFT` (primary), or
   - `VALIDATED` / `VALIDATION_FAILED` for deterministic retry / re-validation of the current finalised file set.
5. Exactly three `MigrationFile` rows for `SUPPLIERS`, `PRODUCTS`, `OPENING_STOCK`, each `storageStatus = FINALISED`, with non-empty `storageKey` and `uploadChecksum`.
6. Private migration storage is configured (`MIGRATION_BLOB_READ_WRITE_TOKEN` only).

## Exit conditions

| Outcome | Package status | Validation run `status` |
|---|---|---|
| Structural + semantic pass, checksums match | `VALIDATED` | `SUCCESS` |
| Any blocking error, checksum mismatch, or incomplete set after eligibility | `VALIDATION_FAILED` | `FAILED` |
| Auth / role / missing package / stale version / non-eligible lifecycle | No success transition; public error | No new success run |

Process / storage failures that occur after eligibility may persist a `FAILED` run and `VALIDATION_FAILED` when the CAS write still applies; they never yield `VALIDATED`. Crash between compute and persist leaves the prior status (never falsely `VALIDATED`).

## Eligible package and file states

- Package: `DRAFT` | `VALIDATED` | `VALIDATION_FAILED` (not `APPROVED`+).
- Files: only `FINALISED` rows participate; `PENDING` / `FAILED` are not validation material.
- File replacement (Slice 2A) demotes package to `DRAFT`, clears `validationChecksum` / `validatedAt`, supersedes the latest run pointer — prior SUCCESS runs become `STALE` / `supersededAt` and **cannot** support later approval.

## Supported Phase 1 entities

Exactly: `SUPPLIERS`, `PRODUCTS`, `OPENING_STOCK` (see `PHASE1_CONTRACT_V1.md` / `lib/migration/contract.ts`).

## Supported CSV format

- CSV only; UTF-8; BOM stripped from first header cell only.
- Delimiter: comma (`,`).
- Record separators: LF or CRLF (CR alone rejected as malformed).
- Quoting: RFC 4180-style; `""` escapes a quote inside quoted fields; malformed quoting → blocking issue.
- No formula evaluation; cells beginning with `=`, `+`, `-`, or `@` are inert data and emit a **warning** (`FORMULA_PREFIX_DETECTED`).
- Max upload / stream bytes: `MIGRATION_MAX_UPLOAD_BYTES` (25 MiB).
- Max data rows (excluding header): `MIGRATION_MAX_ROWS` (50_000).
- Max columns: `MIGRATION_MAX_COLUMNS` (32).
- Max header cell length: 128.
- Max field length: 500.
- Max retained issues: `MIGRATION_MAX_EXCEPTIONS_RETAINED` (2_000).
- Max summary JSON chars: `MIGRATION_MAX_JSON_CHARS` (500_000).

## Header contract

Headers validated via `validateCsvHeaders(entityType, …)`:

- Required headers must be present (case-insensitive compare after NFC / trim / whitespace collapse).
- Duplicate headers → error.
- Unknown headers → error.
- Phase 1 prohibited fields → error.
- Allowed optional headers per entity as in `contract.ts`.

## Structural rules

File presence/eligibility/checksum; encoding/CSV syntax; headers; row-width consistency; blank file / header-only; blank rows (skipped with optional warning budget); row/column/field ceilings; malformed quoting; invalid source identifiers; duplicate source keys within a file; unparseable numerics; invalid monetary precision (>2 dp); invalid `asOfDate`; prohibited negatives; prohibited transaction-history fields; formula-prefix warnings.

## Semantic rules (source-neutral; no ordinary business mutation)

- Unique `sourceSupplierKey` / `sourceProductKey` within their files (NFC + casefold identity).
- `defaultSupplierSourceKey` must reference a suppliers-file key when set.
- Opening-stock `sourceProductKey` must reference the products file.
- Product name required; SKU/barcode optional; missing barcode → **warning**; duplicate non-empty SKU or barcode within file → **error**.
- Sale/cost prices: required decimals → minor units; negatives prohibited for cost; selling price may be zero but not negative.
- Opening stock: non-negative integer quantity; non-negative unit cost; optional `sourceStockValue` must equal `quantity × unitCost` in minor units.
- Cross-file consistency only across the finalised package file set.
- Package branch mappings (same-tenant package metadata): every distinct opening-stock `sourceBranchKey` must have a mapping; unmapped → error. Mapping targets are not re-validated against live Store activity beyond existing FK integrity.
- No read/write of Product, Supplier, Inventory, Sale, Purchase, Payment, Till, Shift, or Journal models for comparison unless separately authorised (not in Slice 2B).

## Issue-code catalogue

Stable public codes (see `lib/migration/issue-codes.ts`). Each retained issue may include only:

`code`, `severity` (`error`|`warning`), `entityType`, `rowNumber`, `column`, `message`, optional bounded `sourceKey`.

No SQL/provider text, stack traces, raw CSV rows, secrets, private URLs, pathnames, or cross-tenant data.

**Errors** block `VALIDATED`. **Warnings** do not.

## Validation-result contract

Persisted on `MigrationValidationRun`:

- `status`: `SUCCESS` | `FAILED` | `STALE` (superseded runs)
- `manifestChecksum`: canonical checksum of the validated file set (+ package identity fields used by `manifestChecksum`)
- `resultDigest`: SHA-256 of canonical sanitised summary (optional integrity aid)
- `summaryJson`: bounded JSON (counts, durationMs, file checksums, truncation flags, retained issues)
- `exceptionCount`, `exceptionsTruncated`
- `validatedByUserId`, `createdAt`, `supersededAt`

Package updates on success/failure: `status`, `version++`, `latestValidationRunId`, `validatedAt` / `validatedByUserId` on success; per-file `validationChecksum` + `validatedAt` + `rowCount` on success only.

## State transitions (Slice 2B)

```
DRAFT → VALIDATED | VALIDATION_FAILED
VALIDATED → VALIDATION_FAILED | DRAFT (demotion via Slice 2A material mutation)
VALIDATION_FAILED → VALIDATED | VALIDATION_FAILED | DRAFT (demotion)
```

Retry of `VALIDATION_FAILED` → `VALIDATED` / `VALIDATION_FAILED` is an explicit Slice 2B lifecycle clarification for same-file re-validation (does not invent approval/import states).

Idempotency: if package is `VALIDATED`, `expectedVersion` matches, and `latestValidationRun` is `SUCCESS` with the same `manifestChecksum` and not superseded → return that run without creating a duplicate.

## Checksum and version binding

- Stream bytes; recompute SHA-256; must equal stored `uploadChecksum`.
- Mismatch → never `VALIDATED`; issue `CHECKSUM_MISMATCH` / storage classification.
- Validation run binds `manifestChecksum` to the exact finalised checksums + package identity.
- CAS: `expectedVersion` must match under `SELECT … FOR UPDATE`; bump `version` on commit.

## Concurrency

- No count-then-write substitute for CAS.
- Concurrent Owner/Manager validates: one wins CAS; loser receives `STALE_VERSION`.
- Holding long validation work **outside** the DB lock; re-lock and re-verify checksums/version before persist.

## Permissions

| Actor | Validate | Read own results |
|---|---|---|
| Owner (session business) | Yes | Yes |
| Manager (session business) | Yes | Yes |
| Cashier | Denied (403) | Denied |
| Unauthenticated | Denied (401) | Denied |
| Foreign business package | `NOT_FOUND` (404), equivalent to nonexistent | Same |

## Data / response ceilings

Issues retained ≤ 2000; summary JSON ≤ 500_000 chars; public API returns retained issues only plus truncation counts; no private Blob URL/pathname/token in responses.

## Audit

Durable `auditLog` actions (fail-closed):

- `MIGRATION_VALIDATION_REQUESTED`
- `MIGRATION_VALIDATION_SUCCEEDED`
- `MIGRATION_VALIDATION_FAILED`
- `MIGRATION_VALIDATION_STALE_VERSION`
- `MIGRATION_VALIDATION_ROLE_DENIED` (when recorded at adapter boundary if applicable)
- `MIGRATION_VALIDATION_CHECKSUM_MISMATCH`
- `MIGRATION_VALIDATION_SUPERSEDED` (via demotion path)

Details: actor, businessId, packageId, runId, versions, bounded checksum ids, counts, duration, sanitised failure class — never raw CSV or secrets.

## Explicit exclusions

Approval; import; reconciliation; product/supplier/stock/accounting mutation; sales/purchases/payments/shifts/tills; barcode generation; Omega/QuickBooks core adapters; Production deploy/migrate/upload/validate; Blob delete / orphan GC; public Blob token fallback; validation on GET/page load; background workers (unless 50k sync evidence forces a separately authorised design).

## Preview and Production gates

- Preview: synthetic data only; branch SHA must match; prove Owner/Manager/Cashier/unauth matrix; valid→`VALIDATED`; invalid→`VALIDATION_FAILED`; no business mutation; no Blob delete.
- Production: **not authorised** by this slice. Live Production A↔B remains `NOT EXECUTED`. Automated PG two-business tests do not convert that into a live Production pass.

## 25 MiB classification

**PASS WITH LIMITATION** — policy + upload token ceiling proven; exact 25 MiB runtime validation remains unproven unless separately executed.
