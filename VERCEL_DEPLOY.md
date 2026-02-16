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

To set them:
1. Go to **Project Settings → Environment Variables**.
2. Paste each name/value pair.
3. Tick **Production** and **Preview** checkboxes.
4. Click **Save**.

---

## Step 4 — Push the Postgres Schema

Before the first deploy, push the schema to your Neon database:

```powershell
# In your local terminal, set the connection string temporarily
$env:DATABASE_URL = "your-neon-direct-connection-string"

# Push the production schema
npx prisma db push --schema=prisma/schema.postgres.prisma

# Seed the database (optional but recommended)
npx prisma db seed
```

Alternatively, you can do this from a Vercel Function or after the first deploy.

---

## Step 5 — Deploy

1. Back in Vercel, click **Deploy**.
2. Vercel will build the Next.js app and deploy it.
3. Your app will be live at: `https://your-project.vercel.app`.

If the build fails, check the build logs — the most common issue is a missing env var.

---

## Step 6 — Custom Domain (optional)

1. In Vercel → **Project Settings → Domains**.
2. Add your domain (e.g., `tillflow.app`).
3. Update your DNS records as instructed by Vercel.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `DEPLOYMENT_NOT_FOUND` | Make sure the project is deployed and the URL matches. |
| Build fails with `POSTGRES_PRISMA_URL` error | Add the env vars in Step 3. |
| `prisma db push` fails | Check that `POSTGRES_URL_NON_POOLING` uses the direct (non-pooled) URL. |
| Login doesn't work | Ensure `NEXTAUTH_SECRET` and `NEXTAUTH_URL` are set. |
| Login lockout is inconsistent across instances | Ensure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. |
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
