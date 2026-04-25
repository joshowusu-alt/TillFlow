# Control plane auth upgrade plan

The current login flow uses a single shared `CONTROL_PLANE_ACCESS_KEY`
that every operator types in. The email field is just a lookup, not a
credential. This is the largest remaining security gap on the control
plane: rotation requires telling everyone, lost devices are not
self-service, and there is no path to 2FA.

This document is the agreed migration plan. Everything below is
**intentionally not yet implemented** because per-user auth needs
human review of the chosen primitives (password hashing library, TOTP
issuer, lockout thresholds) before code lands.

## What's already done

1. `prisma/schema.prisma` — `ControlStaff` has nullable
   `passwordHash`, `passwordSetAt`, `twoFactorSecret`,
   `twoFactorEnabled`, `lastLoginAt` columns. Existing rows pass
   through as null so the legacy login keeps working until cutover.
2. `lib/audit.ts` — `recordAudit()` ready to log `LOGIN_SUCCESS`,
   `LOGIN_FAILED`, `PASSWORD_SET`, `TFA_ENABLED`, `TFA_DISABLED`
   actions when the new flow exists.
3. `lib/notify.ts` — `notifyStateTransition` can be reused to alert
   on suspicious sign-ins (new device family, geographic anomaly).

## Cutover steps (one PR each, in order)

### 1. Add password hashing
- Add `bcrypt` (or `argon2`) to `tishgroup-control/package.json`.
- Add a server action `setControlStaffPasswordAction(formData)` that
  takes `staffId`, `password`. Validates length ≥ 12, hashes with
  cost 12, writes `passwordHash` + `passwordSetAt`.
- Admin-only (gated behind `canManageStaff(staff.role)`).
- New `/staff/:id/credentials` page with a set-password form for
  admins to provision colleagues.

### 2. Per-user login flow
- New server action `loginControlStaffWithPasswordAction`. Accepts
  email + password. If `passwordHash` is null, falls back to the
  legacy `CONTROL_PLANE_ACCESS_KEY` flow; otherwise verifies the
  hash. On success writes `lastLoginAt`, calls
  `recordAudit({ action: 'LOGIN_SUCCESS', ... })`, calls
  `createControlSession`. On fail records `LOGIN_FAILED` with the
  request IP and rate-limits via `lib/security/login-throttle.ts`
  (already present in the main app — copy/refactor).
- Update `/login` page form: keep email field, change "access key"
  to "password" only when the staff record has a passwordHash.

### 3. 2FA opt-in
- `setupControlStaff2FAAction` generates a TOTP secret using
  `otplib` (or stdlib HMAC), stores in `twoFactorSecret`, returns
  the otpauth URL. UI renders a QR via the existing
  `app/api/icon/route.tsx` pattern (or any QR lib). Save click
  flips `twoFactorEnabled = true`.
- Login flow: after password verifies, if `twoFactorEnabled`,
  prompt for the 6-digit code. Verify against `twoFactorSecret`
  with a 30-second window. Failures audit-log the attempt.
- Audit `TFA_ENABLED` / `TFA_DISABLED` events.

### 4. Cutover
- Once every active staff record has a non-null `passwordHash`,
  remove the `CONTROL_PLANE_ACCESS_KEY` fallback from the login
  action. Keep the env var for one release as a kill-switch in
  case a backout is needed.
- Delete the legacy form path on `/login`.

### 5. Hardening (post-cutover)
- Add IP-based lockouts after 10 failed logins in 15 minutes
  (re-use `lib/security/login-throttle.ts`).
- Surface `lastLoginAt` and recent `LOGIN_*` audit rows on the
  staff directory page so admins can see who has stale access.
- Optional: WebAuthn second factor as a 2FA alternative for staff
  on iOS / desktop devices that prefer Touch ID.

## Estimate

- Step 1 (hashing + setup): ~2 hours
- Step 2 (login flow): ~3 hours
- Step 3 (2FA): ~3 hours
- Step 4 (cutover): ~30 minutes
- Step 5 (hardening): ~2 hours

Total: roughly one focused day. Splitting into 4-5 PRs keeps any
single change reviewable.
