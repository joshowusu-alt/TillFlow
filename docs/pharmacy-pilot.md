# Pharmacy dispensing pilot

Scope: opt-in Ghana pharmacy workflow supporting staff checks. Product classifications and age policies are configured by the pharmacy; TillFlow does not infer legal restrictions, validate professional registration against a regulator, diagnose, recommend doses or validate a prescription automatically.

Activation requires a pharmacy business, recorded practitioner credentials and explicit owner activation. Other business types retain their existing operation. Pharmacy credentials require a separate owner assignment; an OWNER/MANAGER role alone is insufficient to approve professional reviews.

Prescription records are private. Public receipts, catalogue payloads and offline caches must never contain prescription images or patient birth dates. Capture manual prescription details plus evidence; OCR is outside this pilot. All quantities are base units.

Batch allocation reconciles labels against existing inventory; it never adds stock or posts accounting entries. Purchases continue to create stock through the established purchase workflow. Newly received stock must be assigned to its physical batches before medicine sales resume. Total batch quantities must equal inventory, including quarantine quantities. Returns and adjustments require batch reconciliation; returned medicine is not automatically released for dispensing.

Checkout reviews are bound to business, branch, cashier, checkout identity, actual quantities and current product policies. Professional approval expires after ten minutes. Final checkout rechecks expiry, quarantine, practitioner status and prescription remaining quantity, then consumes the review, batches and prescription allowance in the same transaction as the sale. Any failure rolls everything back. Ordinary OTC items need a batch check but no invented prescription or blanket age rule.

Medicine sales through offline sync, storefront checkout and sale amendments are unavailable in this pilot. These paths must fail before stock or money writes; medicines cannot silently bypass POS review. A future return/transfer workflow must preserve batch traceability and quarantine decisions.

Release gate: synthetic-data tests, tenant/role checks, atomic rollback and concurrent prescription/batch consumption checks, real phone review, and validation of the dispensing workflow by a practising Ghanaian pharmacist. Controlled-drug registers, regulator integration, clinical decision support and prescription authenticity checking are outside this pilot. Complete private backup/restore support before production activation.

## Implementation verification

Local verification uses a disposable SQLite database with fictional staff, medicines and patients. The browser story covers cashier request, professional approval from a separate staff session, physical batch confirmation and completed sale. Stock and batch quantities decreased together, prescription allowance was consumed, and accounting journals balanced. Workspace layout was checked at 390 px and 1366 px. An uncredentialled owner receives HTTP 403 for the private prescription document; the authorised pharmacist receives HTTP 200 with private/no-store headers.

The full unit regression run passed 4,001 tests. Additional cashier interaction tests cover stale responses, cart changes and patient edits invalidating confirmation. These checks do not establish clinical suitability or replace pharmacist review.

The Postgres suite `lib/services/pharmacy.pg.test.ts` is wired into Postgres Smoke CI. Its rollback, replay, revoked-authority and concurrent prescription-consumption cases must pass before release; they have not yet run for this branch. Production activation is explicitly blocked. Publication to the repository and a review preview remain pending.
