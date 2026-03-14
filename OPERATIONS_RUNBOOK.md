# TillFlow Operations Runbook

## Live Pilot Store Support

For first-store supermarket incidents and cashier-support procedures, use:

- `docs/SUPERMARKET_PILOT_SUPPORT_RUNBOOK.md`

## 1) CI/CD Gates

Required checks are in `.github/workflows/ci.yml`:

- `npm run lint`
- `npm test`
- `npm run build`
- `node scripts/manual-e2e-check.js`
- `node scripts/manual-e2e-deep-check.js`
- `npm run test:qa:phase3a`
- `node scripts/page-speed-check.js`

Do not merge if any gate fails.

## 2) Health + Metrics Endpoints

- Health check: `GET /api/health`
- Metrics: `GET /api/metrics`

For production, set:

```bash
METRICS_TOKEN=<strong-random-token>
```

Then call:

```bash
curl -H "Authorization: Bearer $METRICS_TOKEN" https://your-domain/api/metrics
```

## 3) Scheduled Performance Monitoring

Daily monitor is in `.github/workflows/perf-monitor.yml`.

- Runs `scripts/page-speed-check.js`
- Enforces budgets:
  - max route wall time `<= 400ms`
  - average route wall time `<= 200ms`
  - no route in `slowRoutes`
- Opens a GitHub issue automatically on regression.

## 4) Restore Drill (Monthly)

Run once per month:

1. Export backup from `/settings/backup`.
2. Save backup file to two independent locations.
3. Restore backup in a staging environment.
4. Run:
   - `node scripts/manual-e2e-check.js`
   - `node scripts/manual-e2e-deep-check.js`
   - `npm run test:qa:phase3a`
5. Confirm:
   - sales/purchases/returns still function
   - users can sign in
   - reports load normally
6. Log drill date, owner, and outcome in your operations notes.

## 5) Security Controls Enabled

- CSRF protection for mutating requests via origin and `sec-fetch-site` checks in `middleware.ts`.
- Distributed login brute-force lockout in `lib/security/login-throttle.ts` (Redis-backed, with in-memory fallback when Redis is not configured).
- Session binding and tracking (`ipAddress`, `userAgent`, `lastSeenAt`) in session records.
- Optional 2FA (TOTP) setup in `/account`.

## 6) Redis Throttle Configuration

Set these in production to enable multi-instance login throttling:

```bash
UPSTASH_REDIS_REST_URL=<your-upstash-rest-url>
UPSTASH_REDIS_REST_TOKEN=<your-upstash-rest-token>
```

## 7) Database Posture

- Added query indexes in both Prisma schemas:
  - `prisma/schema.prisma`
  - `prisma/schema.postgres.prisma`

For production (Postgres):

1. Run schema push/migrations before deploy.
2. Validate query plans for high-volume report routes.
3. Keep pagination enabled for large pages and exports.

## 8) Meta WhatsApp EOD Notifications

TillFlow now supports a two-step owner EOD delivery model:

- **Meta automated mode** when production Meta credentials are configured
- **Manual review fallback** when Meta is unavailable, misconfigured, or rejects the send

### Required environment variables

Set these in the target deployment environment:

```bash
META_WHATSAPP_ACCESS_TOKEN=<meta-system-user-access-token>
META_WHATSAPP_PHONE_NUMBER_ID=<meta-whatsapp-phone-number-id>
META_WHATSAPP_API_VERSION=v23.0
META_WHATSAPP_TEMPLATE_NAME=<approved-template-name-or-empty>
META_WHATSAPP_TEMPLATE_LANGUAGE_CODE=en_GB
META_WHATSAPP_WEBHOOK_VERIFY_TOKEN=<strong-random-verify-token>
META_WHATSAPP_APP_SECRET=<meta-app-secret>
META_WHATSAPP_MOCK=false
```

### What the statuses mean operationally

- `ACCEPTED` → Meta accepted the send, final delivery webhook may still be pending
- `DELIVERED` → Meta reported the message as delivered
- `READ` → Meta reported the owner opened the message
- `REVIEW_REQUIRED` → TillFlow preserved a WhatsApp review link because unattended delivery did not complete
- `FAILED` → TillFlow could not complete even the immediate provider step cleanly

### Webhook endpoint

- Verification: `GET /api/notifications/webhook/meta`
- Delivery updates: `POST /api/notifications/webhook/meta`

This route is public in middleware so Meta can reach it, but it is only trusted when:

- the verify token matches `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- the `x-hub-signature-256` signature matches `META_WHATSAPP_APP_SECRET`

### Deployment checklist

1. Configure the callback URL in Meta:
  - `https://your-domain/api/notifications/webhook/meta`
2. Set the verify token in Meta to exactly match `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`
3. Subscribe the WhatsApp app to message status updates
4. If using templates, confirm the configured template is approved before enabling unattended pilot use
5. Redeploy after changing any Meta or cron environment variable

## 9) Cron and Delivery Verification

Use these checks after rollout or env changes:

```bash
npm test
npm run test:qa:phase3b
npm run build
```

Then verify in the TillFlow UI:

1. Open `/settings/notifications`
2. Confirm **Delivery Diagnostics** shows the expected mode
3. Confirm a valid owner WhatsApp number is saved in Ghana format, for example `233241234567`
4. Generate a preview and confirm the summary content looks right

### Safe manual cron verification

Header auth only — never URL secrets:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://your-domain/api/cron/eod-summary?businessId=<business-id>
```

Expected behavior:

- the first cron run for that business/day executes normally
- duplicate cron retries for the same business/day are skipped by the daily `runKey`
- the resulting log shows truthful delivery state instead of a fake sent flag

## 10) Notification Delivery Troubleshooting

Start at `/settings/notifications`.

### If the diagnostics card shows manual review fallback

Check:

- `META_WHATSAPP_ACCESS_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_WHATSAPP_MOCK` is not accidentally enabled in production

### If the diagnostics card shows webhook not ready

Check:

- `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `META_WHATSAPP_APP_SECRET`
- the callback URL in Meta still points at `/api/notifications/webhook/meta`

### If logs stay at `ACCEPTED`

Check:

1. Meta webhook subscription status
2. app secret mismatch
3. whether Meta is actually sending `delivered` / `read` status events
4. whether the deployment was redeployed after env var changes

### If logs show `REVIEW_REQUIRED`

Treat that as a real operational follow-up, not a silent send success.

Use the review link from `/settings/notifications` to complete the handoff manually and capture the reason in support notes.

## 11) Restore Drill Add-on for Notifications

When running the monthly restore drill, also verify:

1. `/settings/notifications` loads correctly
2. Delivery diagnostics reflect the expected environment
3. A preview message can be generated
4. A header-authenticated cron trigger returns a sensible result

If Meta is configured in the target environment, confirm at least one recent message log includes provider metadata such as `provider`, `providerStatus`, and `providerMessageId`.
