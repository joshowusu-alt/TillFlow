# Controlled pilot: operating, recovery and release contract

This document authorises no production action. The final report/PR must record
the candidate SHA and nine check URLs after execution. Never credit a previous
commit's passes to a changed candidate. Founder/release authority: Joshua Owusu
Mintah. Each shop must name an owner, manager and primary cashier privately.

## Approved pilot scope and exclusions

Start with three clean tenants and reviewed opening balances, at most six
simultaneous cashiers across the pilot. Use supported desktop browsers first,
keyboard/product search and electronic receipts. Phone/tablet, physical scanner,
printing and disconnected trading on each actual device are excluded until that
device's checklist below passes. Never require an untested printer to complete a
sale. External image/logo uploads, private migration packages and storefront
orders are excluded until their external-file recovery is independently verified.
Purchase invoice scans are PostgreSQL PurchaseDocument.body bytes, not Blob URLs;
they remain within native database recovery. Product catalogue spreadsheet import
has separate automated coverage; migration-package execution is outside this pilot.

Cash/card/transfer/MoMo are recording methods. A card/transfer entry does not
initiate a card charge or bank transfer. Inspect the merchant's terminal/account
or statement before recording funds as received; never rely only on a customer's
screen. Manual MoMo is PENDING_MANUAL until an authorised owner/manager supplies
checked reference/evidence. The existing confirmation service locks the invoice,
checks tenant/store/role/status and transfers AR to Bank once; it is not an
independent provider settlement certificate. Review outstanding MoMo daily.

Set TILLFLOW_PILOT_MANUAL_PAYMENTS=1 in BOTH the candidate and fallback runtime
after approval. The server refuses MTN collection initiation, polling, retries,
provider reconciliation and webhook application before provider/financial access.
The webhook returns503 without retaining the disabled payload. Do not configure
live collection callbacks to this restricted pilot. No live collection credentials
were used in testing. Provider test doubles are not an MTN sandbox certification.
MTN adapter requests/status parsing and shared-secret webhook plumbing exist;
provider-specific live callback provenance, settlement/reversal and reconciliation
are unverified and excluded. No implemented card-acquirer/bank API integration
was identified in the reviewed recording workflows. Re-enable automation only
through a separately tested, approved rollout.

## Daily operation and stop conditions

The shop owner checks opening stock/cash and ledger/customer/supplier balances
before the first sale, supervises first opening/close and signs the daily totals.
Cashier: correct branch/till, one checkout identity, receipt/reference, retain
uncertain/unsynced transactions; ask the manager before retrying an uncertain
payment or refund. Manager checks cash, debt/AP, MoMo pending, stock exceptions
and failed sync each day. Founder handles technical incidents and release control.
Keep a private agreed phone/WhatsApp contact and an available backup contact before
admitting each business; no support phone number or staffing availability is
invented by this document.

Stop affected financial operations immediately for unexplained duplicate money,
stock or journal effects, cross-business information, missing pending sales,
unbalanced journals or an unexplained till variance. Also stop/limit affected
trading for repeated checkout timeouts/P2024 or inability to recover a pending
sale. Any cashier/manager may stop using the till and notify the owner; the owner
can instruct all staff/devices to stop. Founder decides technical containment.
Do not close a shift merely to discard pending sales. Use a numbered paper log
with cash actually received and receipts during an agreed outage, then reconcile
before any later entry; never enter the same sale both from paper and offline.
Application/tenant suspension, configuration writes, data repairs and production
rollback require the founder's separate explicit production authority.

## Incident response

1. Stop affected writes; record tenant/store/till, time, stable sale/payment IDs,
   error and whether actual funds changed. Preserve IndexedDB and pending queue.
   Never send passwords, full account details or connection strings in support.
2. Establish scope: one device/till/store/tenant or platform. Inspect deployed SHA,
   runtime, errors/P2024 and the server receipt for the same replay identity.
3. Preserve an independent encrypted backup/checkpoint before recovery. Founder
   approves any production rollback or data operation; protect genuine later sales.
4. Follow compatible application fallback below for a code incident. For suspected
   financial corruption, preserve evidence and review a forward fix/reconciliation;
   do not blindly restore yesterday's database over today's genuine money.
5. Reconcile before reopening: sales/payment counts and totals, external/replay
   identities, stock/valuation/movements, till entries/expected cash, AR/AP, every
   journal's debit=credit and trial balance, audit/user/tenant scope. Independently
   verify real cash/provider receipts; a balanced ledger alone is insufficient.
6. Owner and founder sign the private incident log and restart a supervised till.
   Review the next close; no expansion until discrepancies are explained.

## Independent recovery package and operator access

Neon production project curly-salad-15683721/production has six hours of history
retention on inspected configuration. This does not protect against every account,
region or delayed-discovery incident. Connected project administration and read-only
migration access are verified; a production restore is not authorised or rehearsed.
Native PostgreSQL17 recovery is rehearsed in disposable CI. Keep tested pg_dump /
pg_restore versions at least as new as the source major version. Restore to a NEW
database; establish RTO from a representative sized backup, not the tiny CI fixture.

Before first production release, the founder/operator must establish secure access
to GitHub/Vercel/Neon, billing ownership and a second recovery route with MFA
recovery codes in an independent encrypted password vault. Record successful
owner access privately. Vercel production/preview Secret values may not be readable
after creation: retain original credentials in that vault, or plan rotation and
session invalidation. Do not assume a Vercel environment pull contains Secrets.
Record environment names, target/branch scope, runtime, domains, integrations,
cron secret, signing/encryption keys and Blob store identities. No keys belong in
Git, CI artifacts, this report or chat. Agent inspection confirms key presence/
scope only; possession of independent original secrets is a human gate.

Low-cost independent backup procedure (existing operator machine/encrypted storage):

1. Use a private0700 staging directory OUTSIDE the repository. Authenticate via
   the owner's secure local PostgreSQL service/credential mechanism; no passwords
   in command arguments, shell history or shared logs. Read-only pg_dump custom
   archive: `pg_dump --format=custom --no-owner --no-acl --file database.dump`.
   PG service/environment selection must explicitly identify the reviewed source.
   pg_dump does not reproduce global roles/grants; inventory them separately.
2. Copy referenced external assets and maintain a manifest of original URL/key,
   tenant, bytes, size and SHA256. PurchaseDocument bytes are in the DB archive.
   General BLOB_READ_WRITE_TOKEN is currently scoped to prod/preview/development
   and one shared store; do not test-delete or bulk-restore this store. Private
   MIGRATION_BLOB_READ_WRITE_TOKEN uses distinct production/preview stores.
   Public URLs can change when re-uploaded: restore into a separate store/prefix,
   validate hashes/access, then propose explicit reviewed reference updates.
   Do not silently rewrite URLs or overwrite unrelated tenant objects.
3. Include the private environment/integration inventory and securely held original
   secrets/recreation instructions. Record release SHA, schema/migration names,
   record/ledger/stock control totals and external-file manifest. Hash all files.
4. Archive and encrypt with established GnuPG AES256, e.g.
   `tar -cf recovery.tar -C PRIVATE_STAGING .`, then
   `gpg --symmetric --cipher-algo AES256 --output recovery.tar.gpg recovery.tar`.
   Enter the passphrase securely, store it separately, and remove plaintext only
   after verifying the encrypted package. Retain at least one copy independent
   of Neon/Vercel and a second encrypted copy/device under existing resources.
5. On another clean private directory/machine decrypt, require successful integrity
   verification before using output, verify every SHA256, restore PostgreSQL to a
   fresh isolated target with `pg_restore --exit-on-error --no-owner --no-acl`,
   and restore external/configuration fixtures. Test wrong-key/corrupted archive
   refusal. CI rehearses these exact tool classes using fictional assets/secrets
   and the REAL full database dump; this is not a live Blob/vault export.
6. Verify users/password factors, all rows/audit, schema/constraints/sequences and
   financial/stock totals. Never send real backup archives to GitHub artifacts.
   Log date, source SHA, encrypted backup location, hashes, successful restore and
   owner privately. Daily closing package plus a pre-release package is the pilot
   target; one day's possible loss remains if daily backup is the only surviving
   independent copy. Agree that RPO explicitly; six-hour Neon history is additional.

Actual independent production backup, external-file export, secret-vault recovery,
named support availability and a representative restore duration require owner
execution/attestation. These are not represented as agent-completed tests.

## Exact release and configuration approval boundary

Project supermarket-pos / team joshua-owusus-projects. Production remains
dpl_9PvK3eNegxZGp61mXSBhDeeedk39 at cebd811. Project nodeVersion24.x differs from
source/.nvmrc/CI22. A fresh read of the immutable production build log explicitly
confirms package engines override project24.x and Node22.x is selected. Historical
function samples also identified nodejs22.x; a broad fresh runtime log query timed
out, so it supplies no additional evidence. Isolated candidate AND fallback build/start on Node22;
inspect effective production build and function runtime after an approved release.

Production and preview database variable records are separately scoped; encrypted
metadata does not establish their actual host separation. The isolated preflight
pins local CI database pairs. Before a hosted preview, the owner must compare
redacted host/database identities against the approved preview endpoint privately.
Never give a preview the production database. No live tokens/URLs are pulled into
CI. Runtime preflight checks Node22, manual-payment flag, matched direct/pooled
database and reviewed expected production host without printing values or making
requests: `node scripts/pilot-release-preflight.cjs --production` (supply the
reviewed expected host via TILLFLOW_EXPECTED_DATABASE_HOST securely).

Fresh SELECT-only production check found all63 migration names applied, none
unfinished/pending;39 LF checksums match and24 exactly match CRLF of identical
SQL. One rolled-back historical attempt has a successful active application.
No PostgreSQL schema/migration-file change is proposed. Recheck immediately before
release. build:vercel invokes prisma migrate deploy: no build against production
until explicitly approved, even with --skip-domain. Stop for any unexpected pending
migration; do not automatically resolve/checksum-repair historical records.

Approval request must name final tested SHA/tree and immutable fallback, then:

- Align Vercel project setting to Node22.x; add production manual-payment flag=1
  and retain it for fallback. Validate expected host privately, not in public logs.
- Merge integrated PR148 only (includes144), and approve its automatic production
  build/deployment consequences. Do not merge stacked scopes individually.
- Activate source cron `/api/cron/subscription-reminders` daily08:00UTC.
  It enqueues due reminders idempotently; existing every-five-minute storefront
  dispatcher also dispatches subscription rows (the subscription dispatch route
  aliases it). Do not add a second dispatcher. CRON_SECRET and SMS provider key
  presence are verified; real SMS delivery is untested. Activation can consume
  existing SMS credits and needs approval; manual owner renewal contact is the
  fallback. Do not depend on reminders to enforce expired access.
- No schema/data repair, pool-limit increase, region change or new paid service.
  Configuration lists iad1; DB is London, and historical execution samples differ.
  Local CI latency is not deployed/Ghana latency. Measure real request p95/errors
  before expanding; do not move regions speculatively in this release.

Record old deployment, runtime and config, independent encrypted checkpoint,
approved source/fallback build IDs and expiry before proceeding. After approval,
build/stage production without domain assignment where supported, inspect exact
SHA/runtime/no unexpected migration, then promote the tested production-target
build. A preview promotion may rebuild under different production variables;
do not call it the identical tested artifact. A master merge can auto-assign
domains, so approval must cover this and release timing must be coordinated.

Post-release: owner/cashier login, tenant/store rules, one controlled sale/retry/
refund, manual MoMo restrictions, offline queue, drawer/stock/AR/AP/journal,
subscription denial and receipt. Observe errors, P2024, checkout success and real
HTTP latency through supervised opening/close. Halt for the stop conditions above.

## Safe fallback procedure

Immutable fallback source:9a5289d00c231cfe96296e0599ee173309eeec77, based on the
previous passing dcdf73eb plus the same manual-payment guard. Independent production
build and same-origin candidate -> fallback -> candidate native IndexedDB/real
PostgreSQL test are mandatory in the final fictional-business job. It covers a
503 capture, lost acknowledgement AFTER real commit, two queued identities,
another business's pending record, different store snapshots, replay and exact
stock/cash/journal outcomes. Service-worker migration has separate native coverage.

The isolated Next build artifact is retained ONE day to minimise storage. It is
not a production-configured Vercel promotion artifact. Before production activation,
record/build the approved fallback under the reviewed production configuration
(requires approval because its build has migrate deploy), stage without domains,
and record its Vercel deployment ID. If the build artifact/evidence has expired or
source/runtime changed, rebuild/retest; never claim an expired artifact is ready.

For code failure: stop affected writes, preserve queues, founder approves compatible
fallback, verify its Node22/manual flag/database target/schema and switch domains
to that exact built fallback. Retain v4 reader and stable sale/hash keys. Do not
clear IndexedDB, downgrade to v3, regenerate sale IDs or re-enter uncertain sales.
Replay only to the same business/store/till/shift. Closed shifts/permission changes
need reviewed recovery, not bypass. Reconcile server identity before acknowledging
cash. After correction, switch back and prove no additional economic effects.
Never roll the database back merely because the application is rolled back.

## Shop acceptance record (private copy per business/device)

Business type/name:____ Owner/manager/cashier:____ Date/time:____
Candidate/deployed SHA:____ Browser/device/OS:____ Branch/till:____
Operator records PASS/FAIL/BLOCKED, stable references and notes for every row.
No actual customer details belong in a public PR. Any financial mismatch is FAIL.

| Task | Expected evidence | Result / refs / operator |
|---|---|---|
| Owner registration / plan / first cashier | Correct clean business, role login, trial/expiry visible | ____ |
| Two stores, separate cashiers/tills | Correct branch stock and no other business access | ____ |
| Keyboard/product search | Correct product/unit/price, quick repeat checkout | ____ |
| Actual scanner (optional until PASS) | Correct barcode, Enter behavior, no duplicate cart line | ____ |
| Actual printer (optional until PASS) | Readable electronic/printed amount, currency, reference, retries no sale duplication | ____ |
| Desktop, phone and tablet separately | Checkout/search/forms/receipt readable, no blocked controls | ____ |
| Cash GHS500 / MoMo GHS300 / credit GHS150 | Invoices, payments, stock and journal agree; merchant account evidence for manual MoMo | ____ |
| Card / bank transfer recording | Real merchant receipt independently checked; no automated-settlement claim | ____ |
| Opening float200 / debt cash100 | Correct physical till and debtor balance reduction | ____ |
| Supplier cash120 / expense cash30 | AP/expense, till reductions and journal once | ____ |
| Cash refund50 / partial debt or supplier payment | Linked return/payment, stock/debt/AP and journal correct | ____ |
| Close and count | Physical expected600; counted cash, variance, reason and journal agree | ____ |
| Stock check / transfer / count | Movement sum and store balances agree, uncounted distinct from zero | ____ |
| Slow/intermittent network on actual device | No frozen uncertain submit; preserve identity and reconcile receipt | ____ |
| Disconnect, sale, browser refresh, reconnect | Original pending identity survives and commits once; do not refresh unaccepted live sale blindly | ____ |
| Delayed sync after close | Retained reviewable transaction; manager recovery, no silent loss or forced closed-shift posting | ____ |
| Reports/export | Sales/till/AR/AP/stock/P&L/trial balance and export control totals agree | ____ |
| Expired/restricted role | Direct URL/write denied without financial mutation | ____ |
| Training and support | Cashier can open/sell/recover/close; owner reconciles, contacts support and stops writes | ____ |
| Independent recovery package | Encrypted copy, external/config inventory, verified restore, named access holders | ____ |

Use fictional drills for mini-mart, bookshop and boutique before real data. No real
money-provider test or production financial write is authorised by this checklist.
Record all unpassed features as excluded, then obtain founder scope acceptance.
