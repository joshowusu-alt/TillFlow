# Control plane auth upgrade

Phase 0 authentication containment is implemented. Staff sign in with a
personal password. Login never creates a staff row, never bootstraps
`CONTROL_ADMIN`, and never accepts `CONTROL_PLANE_ACCESS_KEY` as a
credential or session secret.

## Phase 0 (landed)

1. Session HMAC is derived only from `CONTROL_SESSION_SECRET` (minimum
   16 characters). `controlAuthConfigured()` is true only when that
   secret is set. There is no fallback to `CONTROL_PLANE_ACCESS_KEY`.
2. Roles are allowlisted: `CONTROL_ADMIN`, `ACCOUNT_MANAGER`,
   `COLLECTIONS_AGENT`, `SUPPORT_AGENT`. Unknown roles fail closed
   (`parseControlStaffRole` / `normalizeRole` return `null`). Sessions
   with an unknown role are rejected.
3. Login looks up `ControlStaff` by email. Missing, inactive, null
   `passwordHash`, and failed `bcrypt.compare` all deny access. Missing
   email, bad password, and null hash share one generic error string.
   Failures are audited internally without hashes.
4. Successful login writes `lastLoginAt`, records `LOGIN_SUCCESS`, and
   stores `sessionVersion` in the signed cookie. `getControlStaffOptional`
   rejects the cookie when `sessionVersion` does not match the database.
5. Password set is `CONTROL_ADMIN` only, requires an existing allowlisted
   target, enforces a 12-character minimum, hashes with bcrypt cost 12,
   audits `PASSWORD_SET` without the hash, and increments `sessionVersion`.
   Initial Production provisioning before the new app is live uses the
   operator CLI below, not `/staff`.
6. Middleware keeps `/api/digest` and `/api/cron` reachable without a
   staff cookie (those routes use their own secrets). `next` is set only
   when `isSafeInternalReturnPath` accepts the return path.
7. `scripts/auth-cutover-preflight.mjs` is a read-only count of active
   staff with `passwordHash IS NULL`, grouped by role. It prints counts
   and roles only. Exit `1` if any active staff lack a password. When
   `VERCEL_ENV=production` or `CONTROL_ENFORCE_AUTH_CUTOVER=1`, that
   failure is the production blocker.

## One-time Production password cutover CLI

Use this **after** `prisma migrate deploy` and **before** switching the
TishGroup Production alias to the new application. It is not a public
route. Passwords must be typed at a hidden prompt or piped on stdin —
never as command arguments, env vars, or files in this repo.

A boolean isolated flag is never enough. Production mode requires the
exact Production fingerprint. Preview mode requires disposable mode, the
isolated fingerprint, and a database-side sentinel. There is no `--force`.

Preview rehearsal (isolated clone only):

```bash
CONTROL_PASSWORD_CUTOVER_ENV=preview \
CONTROL_PREVIEW_ISOLATED_DB=1 \
CONTROL_DISPOSABLE_MODE=1 \
CONTROL_DISPOSABLE_SENTINEL_LABEL=tishgroup-phase0-preview \
CONTROL_PASSWORD_CUTOVER_HOST_PREFIX=ep-old-sunset-za6o0nyo \
CONTROL_PASSWORD_CUTOVER_DATABASE=tillflow_preview \
CONTROL_PASSWORD_CUTOVER_USER=tillflow_preview_app \
  node scripts/provision-control-staff-password.mjs \
  --mode preview --staff-id <STAFF_ID> \
  --expected-host-prefix ep-old-sunset-za6o0nyo \
  --expected-database tillflow_preview \
  --expected-user tillflow_preview_app \
  --confirm-target tishgroup-phase0-preview --dry-run
```

Production (owner-authorised, one staff id at a time):

```bash
CONTROL_PASSWORD_CUTOVER=1 CONTROL_PASSWORD_CUTOVER_ENV=production \
CONTROL_PASSWORD_CUTOVER_HOST_PREFIX=ep-fancy-darkness-abyuvjxt \
CONTROL_PASSWORD_CUTOVER_DATABASE=neondb \
CONTROL_PASSWORD_CUTOVER_USER=neondb_owner \
  node scripts/provision-control-staff-password.mjs \
  --mode production --staff-id <STAFF_ID> \
  --expected-host-prefix ep-fancy-darkness-abyuvjxt \
  --expected-database neondb \
  --expected-user neondb_owner \
  --confirm <STAFF_ID> --confirm-target ep-fancy-darkness-abyuvjxt --dry-run

CONTROL_PASSWORD_CUTOVER=1 CONTROL_PASSWORD_CUTOVER_ENV=production \
CONTROL_PASSWORD_CUTOVER_HOST_PREFIX=ep-fancy-darkness-abyuvjxt \
CONTROL_PASSWORD_CUTOVER_DATABASE=neondb \
CONTROL_PASSWORD_CUTOVER_USER=neondb_owner \
  node scripts/provision-control-staff-password.mjs \
  --mode production --staff-id <STAFF_ID> \
  --expected-host-prefix ep-fancy-darkness-abyuvjxt \
  --expected-database neondb \
  --expected-user neondb_owner \
  --confirm <STAFF_ID> --confirm-target ep-fancy-darkness-abyuvjxt
```

Then:

```bash
CONTROL_ENFORCE_AUTH_CUTOVER=1 node scripts/auth-cutover-preflight.mjs
```

The CLI always prints a dry-run result before any write. It refuses
Preview, CI, and unknown databases in Production mode, and refuses
Production and unknown databases in Preview mode.

## Safe rollback (maintenance / read-only)

Set `CONTROL_MAINTENANCE_MODE=read-only` on the Phase 0 application.
Personal login remains available. Shared-key authentication remains
impossible. Commercial, staff, support, payment, subscription, and
customer-visible mutations are denied in server actions. Cron/digest
routes fail closed. `/api/health` remains available and does not expose
secrets. Remove the variable or set it to `off` to restore normal Phase 0
operation without dropping schema or repairing data.

Do not restore the June 2026 TishGroup binary. That binary restores
shared-key authentication.

## Remaining work

### Create-staff password persistence

The staff create form now collects `password` (min 12). The create
action in `app/actions/control-businesses.ts` still upserts name/role
and does not hash or store that password. Until that action is updated,
admins must use **Set a personal password** after creating a row.

### 2FA opt-in

- Generate a TOTP secret, store `twoFactorSecret`, return an otpauth URL.
- After password verifies, prompt for the 6-digit code when
  `twoFactorEnabled` is true.
- Audit `TFA_ENABLED` / `TFA_DISABLED`.

### Hardening

- Surface `lastLoginAt` and recent `LOGIN_*` rows on the staff directory.
- Optional WebAuthn second factor.

## Preflight

From `tishgroup-control`:

```bash
node scripts/auth-cutover-preflight.mjs
```

Uses `POSTGRES_URL_NON_POOLING` or `DATABASE_URL`. Never prints emails,
names, or hashes.
