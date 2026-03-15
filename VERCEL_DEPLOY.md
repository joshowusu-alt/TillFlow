# TillFlow — Vercel + Neon Postgres Deployment Guide

Step-by-step instructions to get TillFlow live on Vercel with a free Neon Postgres database.

---

## Step 1 — Create a Neon Postgres Database (free tier)

1. Go to **https://neon.tech** and sign up (GitHub SSO works).
2. Click **Create Project** → name it `tillflow`.
3. Choose the region closest to your users (e.g., `eu-west-1` for UK/Ghana).
4. Once created, open the **Dashboard** → **Connection Details**.
5. Copy these two connection strings (switch the toggle to show both):

| Variable | Where to find it |
|---|---|
| `POSTGRES_PRISMA_URL` | The **pooled** connection string (contains `-pooler` in the hostname). Append `?pgbouncer=true&connect_timeout=15` if not already present. |
| `POSTGRES_URL_NON_POOLING` | The **direct** (non-pooled) connection string. Used for migrations. |

They look like:
```
postgresql://user:password@ep-xyz-123-pooler.eu-west-1.aws.neon.tech/neondb?pgbouncer=true&connect_timeout=15
postgresql://user:password@ep-xyz-123.eu-west-1.aws.neon.tech/neondb?connect_timeout=15
```

---

## Step 2 — Connect the GitHub Repo to Vercel

1. Go to **https://vercel.com/dashboard** and log in.
2. Click **Add New → Project**.
3. Click **Import Git Repository** and select `joshowusu-alt/TillFlow`.
   - If it doesn't appear, click **Adjust GitHub App Permissions** and grant access.
4. **Framework Preset**: Next.js (auto-detected).
5. **Root Directory**: leave as `.` (default).
6. **Build & Output Settings**: leave defaults.

> ⚠️ Don't click "Deploy" yet — add environment variables first.

---

## Step 3 — Add Environment Variables

In the Vercel project settings (or during import), add these env vars:

| Name | Value | Environment |
|---|---|---|
| `POSTGRES_PRISMA_URL` | your Neon **pooled** URL | Production, Preview |
| `POSTGRES_URL_NON_POOLING` | your Neon **direct** URL | Production, Preview |
| `NEXTAUTH_SECRET` | run `openssl rand -base64 32` to generate | Production, Preview |
| `NEXTAUTH_URL` | `https://your-project.vercel.app` | Production |
| `UPSTASH_REDIS_REST_URL` | your Upstash Redis REST URL | Production, Preview |
| `UPSTASH_REDIS_REST_TOKEN` | your Upstash Redis REST token | Production, Preview |
| `META_WHATSAPP_ACCESS_TOKEN` | Meta system-user access token for WhatsApp | Production, Preview |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp phone number ID | Production, Preview |
| `META_WHATSAPP_API_VERSION` | `v23.0` (or your selected Graph API version) | Production, Preview |
| `META_WHATSAPP_TEMPLATE_NAME` | approved template name, or leave blank for freeform mode | Production, Preview |
| `META_WHATSAPP_TEMPLATE_LANGUAGE_CODE` | e.g. `en_GB` | Production, Preview |
| `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` | strong random token for Meta webhook verification | Production, Preview |
| `META_WHATSAPP_APP_SECRET` | Meta app secret for signature verification | Production, Preview |
| `META_WHATSAPP_MOCK` | `false` in production | Production, Preview |

To set them:
1. Go to **Project Settings → Environment Variables**.
2. Paste each name/value pair.
3. Tick **Production** and **Preview** checkboxes.
4. Click **Save**.

> If you rotate `CRON_SECRET` or change any Meta WhatsApp env var, redeploy the latest build so the running server picks up the new values.

---

## Step 4 — Create and Apply the Initial Postgres Migration

Before the first deploy, make sure your local shell has the same Postgres connection strings from Step 3 available, then create or verify the committed migration and check its status:

```powershell
# Optional when creating or checking migrations locally:
# $env:POSTGRES_PRISMA_URL = "your-neon-pooled-connection-string"
# $env:POSTGRES_URL_NON_POOLING = "your-neon-direct-connection-string"
#
# Create a new Postgres migration file when schema.postgres.prisma changes
npm run db:migrate:create

# Check migration status against Neon
npx prisma migrate status --schema=prisma/schema.postgres.prisma

# Seed the database (optional but recommended)
npx prisma db seed
```

TillFlow now uses committed Prisma migrations for production safety. The deployed Vercel build runs:

```bash
npm run build:vercel
```

That script includes `prisma migrate deploy --schema=prisma/schema.postgres.prisma`, so committed migrations are applied automatically during deployment.

---

## Step 5 — Deploy

1. Back in Vercel, click **Deploy**.
2. Vercel will build the Next.js app and deploy it.
3. Your app will be live at: `https://your-project.vercel.app`.

If the build fails, check the build logs — the most common issue is a missing env var.

---

## Database Migration Workflow

- **Create a migration:** `npm run db:migrate:create`
- **Deploy migrations manually:** `npm run db:migrate:deploy`
- **Check status:** `npx prisma migrate status --schema=prisma/schema.postgres.prisma`
- **Automatic production deploy:** Vercel applies committed Postgres migrations during `npm run build:vercel`
- **Local SQLite development:** `npm run db:setup` still uses `prisma db push` with `prisma\schema.prisma`, which is fine for local development only

When you change the production schema:

1. Update `prisma\schema.postgres.prisma`
2. Run `npm run db:migrate:create`
3. Commit the generated migration files
4. Deploy normally to Vercel

---

## Step 6 — Custom Domain (optional)

1. In Vercel → **Project Settings → Domains**.
2. Add your domain (e.g., `tillflow.app`).
3. Update your DNS records as instructed by Vercel.

---

## Step 7 — Configure Meta Webhook + EOD Verification

After the first deploy:

1. In Meta, configure the callback URL:
   - `https://your-domain/api/notifications/webhook/meta`
2. Use the same verify token value you stored in `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`
3. Subscribe the WhatsApp app to message status updates
4. In TillFlow, open `/settings/notifications` and confirm the diagnostics card shows:
   - Meta credentials = Configured
   - Webhook delivery updates = Ready
5. Trigger a safe one-business cron run using header auth

For broader maintenance and live support, use:

- `OPERATIONS_RUNBOOK.md`
- `docs/SUPERMARKET_PILOT_SUPPORT_RUNBOOK.md`

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `DEPLOYMENT_NOT_FOUND` | Make sure the project is deployed and the URL matches. |
| Build fails with `POSTGRES_PRISMA_URL` error | Add the env vars in Step 3. |
| `prisma migrate deploy` fails | Check that `POSTGRES_URL_NON_POOLING` uses the direct (non-pooled) URL and that the migration files are committed. |
| Login doesn't work | Ensure `NEXTAUTH_SECRET` and `NEXTAUTH_URL` are set. |
| Login lockout is inconsistent across instances | Ensure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. |
| EOD summary falls back to manual review | Check Meta env vars and `/settings/notifications` diagnostics. |
| Meta webhook verification fails | Check `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` and the callback URL. |
| Delivery logs stay at `ACCEPTED` | Check `META_WHATSAPP_APP_SECRET`, webhook subscription, and redeploy after env changes. |
| Seed fails on Neon | Run `SET search_path TO public;` if using a custom schema. |

---

## Architecture

```
  Browser ──→ Vercel Edge ──→ Next.js App (Serverless)
                                    │
                                    ▼
                            Neon Postgres (pooled)
                            ┌──────────────────┐
                            │  PgBouncer Pool   │
                            │   ↓               │
                            │  PostgreSQL 16    │
                            └──────────────────┘
```

- **Dev**: SQLite (`prisma/schema.prisma`)
- **Prod**: PostgreSQL via Neon (`prisma/schema.postgres.prisma`)
- Vercel automatically uses the production schema when `POSTGRES_PRISMA_URL` is set.
