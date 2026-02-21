# TillFlow Operations Runbook

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
