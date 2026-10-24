# Controlled three-business pilot release checklist

No production action is authorised by this document. Record the immutable candidate SHA and all nine check URLs in PR148 and the final report. A passing earlier commit is not a passing release.

## RG-04: observed cause and controlled application correction

The production-build browser reproduced stalled query-only App Router transitions in both catalogue hierarchy selection and typed product search. Response headers arrived promptly, but that does not establish complete Flight-body latency. The URL and selected hierarchy stayed old. A captured React tree contained a fulfilled Suspense retry thenable with suspended work; a normal-priority viewport update retried the work and committed the navigation. Mouse movement, active animation frames and completed font/style loading did not clear it. This narrows the failure to the client transition/retry path; it does not establish a sole upstream vendor defect.

Catalogue hierarchy, search and pagination now use server-authoritative document GET navigation, avoiding that stalled transition. Classification saves return the canonical tenant-validated destination to the client, which follows it with document navigation after persistence; this also avoids the stalled same-route Flight redirect after group creation. Search submits with Enter or the Search button. The catalogue reset marker prevents saved-list restoration from silently undoing an explicit empty-search clear. Tenant/session checks and database filtering remain server-side. Existing timeout/URL/selected-state checks are retained; browser coverage adds empty and non-empty search clears, reload, typed search, actual pagination and back navigation.

The same failure reproduced in Supplier search, so the shared search control used by Products, Suppliers, Customers and Inventory now submits a document GET. Pagination on those four lists and stored-list restoration use the same reliable request boundary. Explicit search/clear/page requests carry resetList=1 so a native first-page/empty-query request cannot restore the old query. Scroll persistence also observes changed filters instead of restoring stale closures.

Tradeoffs: document reload and scroll reset; search submits with Enter/Search and navigating away still discards unsaved inline product form input. Other Pagination consumers retain their existing router behavior. This is a scoped application workaround, not a claim that Next's transition implementation has been patched. Any further confirmed affected workflow must be fixed rather than labelled flaky.

An independent bundled-font regression is corrected with an exact four-file public allowlist; adjacent routes remain authenticated. Do not broaden public API access.

## Required automated evidence

- Require POS safety, build, migration status, database pilot, unit, lint, fictional-business acceptance, typecheck and patched-runtime to pass on one SHA.
- Run the complete POS job after deep flow, including Phase3A financial QA, reports money layout and UI programme. Do not credit skipped later steps.
- Browser JSON recovery must prove both contracts: an operational-history snapshot is refused without changing persisted financial records, and a separate clean fictional business restores core stock/cash/journal records, invalidates sessions and permits owner re-login. Do not remove safety guards or delete operational evidence merely to make a restore succeed. The UI describes the file as a trading snapshot rather than a complete database backup.
- Native recovery: the opt-in local CI PostgreSQL17 drill creates real debtor/supplier/expense evidence, dumps the entire database with pg_dump, creates a different database and uses pg_restore. Every public table's full-row fingerprint/count, columns, constraints, indexes, triggers, routines and sequences must match; compare ledger totals and verify owner/two cashier password hashes. Audit, risk and stocktake evidence must be non-empty and retained. No dumps/credentials are uploaded.
- Recovery covers PostgreSQL contents. External Blob objects, provider configuration, encryption/signing secrets, roles/global grants, Neon platform retention and region failure are separate operational recovery dependencies. A local restore duration is not a contractual production RTO/RPO. Restore is to a new isolated database, never over production.
- PostgreSQL dump/reparse flattens BETWEEN's nested AND terms in two named purchase discount CHECK definitions. The comparator canonicalizes only the exact three-term pure conjunction, preserving changed bounds, OR, extra terms and NOT VALID. Both source and restored databases must independently reject negative/over-limit discounts and accept the valid boundaries in rolled-back transactions. No CHECK is omitted from the comparison.

## Review and exact release changes

1. Review financial base PR144 and integrated PR148. PR145-147 are stacked scope reviews; do not merge duplicate packages blindly. Review the final tree against production master, not only PR148's base.
2. The candidate introduces no PostgreSQL schema or migration-file changes relative to production commit cebd811. Recheck production's applied migration names/checksums read-only immediately before release. Existing build:vercel runs prisma migrate deploy: do not trigger it against production without specific migration approval or verified no-pending-migration evidence.
3. Source engines/.nvmrc/CI use Node22. The Vercel project was still configured24.x on read-only inspection. Obtain approval to align that setting to22.x and verify the effective build and function runtime. Do not change database pool limits as a substitute for the proved composed-transaction fix.
4. Record current production deployment, aliases and previous SHA; keep production/preview database targets isolated. Do not pull production credentials into a test job.
5. Verify actual Neon backup retention and independent access to required secrets/Blob backups. Take a recoverable checkpoint before any approved release.
6. Rehearse the production build in isolation. Record service and real HTTP latency separately; require all checkout identities, stock, cash and ledger controls to match.
7. Obtain separate founder approval to merge/release exact reviewed source, adjust production runtime and execute any pending migrations. All are approval boundaries, not completed actions.

## Rollback and queue compatibility

- Never select the old production deployment just because Vercel labels it a rollback candidate. A v3-only offline database opener cannot read the v4 IndexedDB database and can strand pending sales.
- Keep the v4 reader, compound product key, active-business scope and replay identity behavior in every rollback build. Do not downgrade or clear IndexedDB, regenerate queued sale IDs or force-delete rejected/uncertain sales.
- Emergency UI fallback source900d0f7 retains the same v4 storage/sync/service-worker source as this remediation increment. It retains the known catalogue navigation issue and must not be described as a fully passing release. A production fallback must be built/reviewed before go-live and separately approved; do not blindly promote the original cebd811 build.
- Verify pending-queue preservation with native browser migration/isolation/reload tests and the rollback-reader compatibility check. Keep authenticated user/business isolation in the fallback. Retain unsynced-device evidence and reconcile acknowledged server identities before resuming a cashier.
- Roll back application code only when compatible with current schema/data. A suspected financial defect requires stopping affected writes, preserving evidence and a reviewed forward fix/reconciliation. Restoring a database snapshot blindly can erase genuine intervening sales; data repair always needs separate approval.

## Before charging three pilot businesses

- Supervised GHS600 physical cash exercise, opening balances, two stores/tills and trained owner/cashiers.
- Actual scanner keyboard behavior, printer paper/receipt readability, phone/tablet devices and Ghana slow/disconnected network conditions.
- Real card/MoMo confirmation, settlement and webhook authentication if those integrations will be used. Clearly labelled provider simulations do not satisfy this gate.
- Named support contact, recovery procedure and daily review of checkout errors, P2024, cash/stock variances and outstanding customer/supplier balances.
- After an approved release: verify effective SHA/runtime, owner/cashier login, tenant/store restrictions, controlled sale/retry/refund, expected cash/stock/journal, subscription restrictions and offline replay. Halt expansion for any unexplained financial discrepancy.
