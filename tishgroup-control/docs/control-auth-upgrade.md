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

Preview rehearsal (isolated clone only):

```bash
CONTROL_PASSWORD_CUTOVER_ENV=preview CONTROL_PREVIEW_ISOLATED_DB=1 \
  node scripts/provision-control-staff-password.mjs \
  --mode preview --staff-id <STAFF_ID> --dry-run

CONTROL_PASSWORD_CUTOVER_ENV=preview CONTROL_PREVIEW_ISOLATED_DB=1 \
  node scripts/provision-control-staff-password.mjs \
  --mode preview --staff-id <STAFF_ID> --confirm <STAFF_ID>
```

Production (owner-authorised, one staff id at a time):

```bash
CONTROL_PASSWORD_CUTOVER=1 CONTROL_PASSWORD_CUTOVER_ENV=production \
  node scripts/provision-control-staff-password.mjs \
  --mode production --staff-id <STAFF_ID> --dry-run

CONTROL_PASSWORD_CUTOVER=1 CONTROL_PASSWORD_CUTOVER_ENV=production \
  node scripts/provision-control-staff-password.mjs \
  --mode production --staff-id <STAFF_ID> --confirm <STAFF_ID>
```

Then:

```bash
CONTROL_ENFORCE_AUTH_CUTOVER=1 node scripts/auth-cutover-preflight.mjs
```

The CLI refuses the isolated Preview database in Production mode and
refuses Production in Preview mode. It does not create staff, change
roles, or activate accounts.

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
