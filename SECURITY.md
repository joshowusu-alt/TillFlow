# TillFlow Security

## 1. Security Model Overview

TillFlow uses a defense-in-depth model built around authenticated business context, explicit role checks, server-side business logic, and hardened browser and webhook boundaries. The goal is to protect cashier workflows, financial records, customer data, and operational integrations without making day-to-day POS use fragile.

Core controls include:

- session-based authentication
- role-based authorization
- CSRF protection in middleware
- Prisma-backed server-side data access
- rate limiting on sensitive entry points
- structured logging and audit trails
- verified third-party webhooks

## 2. Authentication

TillFlow uses session-based authentication with HTTP-only cookies.

### Session cookies

- `pos_session_<businessId>` stores the session token for a specific business context
- `pos_active_business` tracks the currently active business for the UI and request resolution

Cookies are written with:

- **HTTP-only** for the session token
- **SameSite=Lax**
- **Secure** in production when the app is not explicitly configured for plain HTTP
- a **7-day session TTL**

### Password handling

- Passwords are hashed with **bcrypt** using cost factor **10**
- Password verification happens server-side in `app\actions\auth.ts`
- User sessions are stored in Prisma and capped so older sessions can be removed automatically

### Optional two-factor authentication

TillFlow supports optional TOTP-based two-factor authentication:

- powered by `otplib`
- 6-digit codes
- 30-second periods
- small clock drift tolerance

If `twoFactorEnabled` is set on the user, login requires a valid OTP in addition to the password.

### Rate limiting

Login attempts are rate-limited in `lib\security\login-throttle.ts`:

- **8 failed attempts per 15 minutes**
- **15-minute lockout** after the threshold is reached
- **Upstash Redis** is used when configured
- an **in-memory fallback** is used if Redis is unavailable

Additional throttles exist for registration, password reset, and offline sync endpoints.

## 3. Authorization

Authorization is role-based.

Supported roles are:

- `CASHIER`
- `MANAGER`
- `OWNER`

Enforcement happens in `lib\auth.ts` and in server actions:

- `requireUser()` blocks anonymous or inactive users
- `requireRole()` restricts access by role
- `requireBusiness()` and `requireBusinessStore()` ensure the current business and store context is available
- many actions use `withBusinessContext([...roles])` to combine authentication, role checks, and business scoping

Sensitive workflows such as user management, onboarding, settings changes, and some stock operations require `MANAGER` or `OWNER` roles. Discount overrides and certain till operations also rely on manager approval flows.

## 4. CSRF Protection

CSRF protections are enforced in `middleware.ts` for mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`).

Controls include:

- validating the `Origin` host against the current request host
- falling back to a same-host `Referer` check
- validating `Sec-Fetch-Site`
- rejecting suspicious cross-site mutations with HTTP 403

The middleware intentionally allows legitimate browser contexts such as PWAs and top-level submissions when they still satisfy the same-origin model.

## 5. Input Validation

TillFlow relies on server-side validation and Prisma-backed persistence rather than trusting browser input.

Key protections:

- **Prisma parameterized queries** are used for database access, which helps prevent SQL injection
- **form helpers** in server actions normalize and coerce request data before it reaches services
- **enum validation** is used for controlled fields such as payment status
- **PIN sanitization** in `lib\security\pin.ts` strips non-digits before validation and bcrypt comparison
- **service-layer checks** validate stock availability, discount approvals, customer requirements, and related business rules before writes occur

## 6. Security Headers

Security headers are configured in `next.config.js` and `middleware.ts`.

### Application headers

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Permissions-Policy`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-XSS-Protection: 1; mode=block`

### Transport protection

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

The CSP limits sources for scripts, styles, fonts, images, network connections, and form actions. Frame embedding is disabled with `frame-ancestors 'none'`.

## 7. Secret Management

Secrets are expected to be provided through environment variables, especially in Vercel-managed environments.

Examples include:

- database connection strings
- `METRICS_TOKEN`
- `CRON_SECRET`
- Upstash Redis credentials
- mobile money webhook secrets
- Meta WhatsApp webhook secrets and tokens

Operational rule:

- **Never commit secrets to git**
- use Vercel project environment variables or local untracked environment files
- rotate secrets if they are exposed or if operational access changes

## 8. Public Routes

Some routes are intentionally reachable without a session so the application can boot, recover, or receive third-party events.

Documented public routes in `middleware.ts` include:

- `/login` — required for initial authentication
- `/register` — required for first-time business setup
- `/welcome` — anonymous landing page
- `/demo` — anonymous demo experience
- `/offline` — offline fallback page for the PWA
- `/api/health` — infrastructure health probe for load balancers and uptime monitors
- `/api/payments/momo/webhook/mtn` — inbound mobile money status updates from the provider
- `/api/notifications/webhook/meta` — inbound Meta WhatsApp verification and delivery events

These routes are public by design, but webhook endpoints are still protected with shared-secret or signature verification.

## 9. Webhook Security

### Mobile Money webhook

`/api/payments/momo/webhook/mtn` validates a configured shared secret before processing payloads.

Accepted inputs include:

- `x-momo-webhook-secret`
- `x-webhook-secret`
- `Authorization: Bearer <secret>`

If the configured secret is missing or does not match, the route fails closed with HTTP 401.

### Meta WhatsApp webhook

`/api/notifications/webhook/meta` uses two layers:

- **GET verification** validates `hub.verify_token` against `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- **POST events** validate `x-hub-signature-256` using the raw request body before applying events

Invalid verification or signatures are rejected with HTTP 401.

## 10. Reporting Vulnerabilities

If you discover a security issue in TillFlow:

1. **Do not** open a public issue with exploit details.
2. Share the report privately with the repository maintainer or the TillFlow Technologies internal support or security owner.
3. Include:
   - affected route or feature
   - reproduction steps
   - impact assessment
   - any logs, payloads, or screenshots that help triage
4. Allow time for investigation and remediation before broader disclosure.

If a dedicated security mailbox is established later, update this file to point reports there. Until then, use the repository maintainer or the TillFlow Technologies private support channel for responsible disclosure.
