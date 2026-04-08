# Tish Group Control

Tish Group Control is a separate internal product for running the commercial and operational portfolio behind Tillflow.

It is intentionally not mounted inside the tenant app. Tillflow remains the customer-facing product. Tish Group Control is the internal control plane for:

- plan provisioning
- payment recording
- due-date management
- grace and fallback monitoring
- revenue visibility
- account health and support follow-up

## Current scope

This first scaffold is a standalone Next.js app with:

- a portfolio overview page
- a business roster
- a business detail page
- collections queues
- revenue summary
- operating playbooks

The app now attempts to read real Tillflow business data from the shared database and derive commercial state server-side. If that data is unavailable, it falls back to the mock 10-business portfolio scenario used during planning.

The shared Prisma schema now also includes dedicated control-plane tables for:

- internal staff records
- managed business profiles
- subscriptions
- payments
- internal notes

Tish Group Control will use those records when they exist, while still falling back to tenant-derived business data in environments where the new migration has not been applied yet.

The app now also includes:

- internal staff sign-in backed by `ControlStaff`
- TG staff management screens for creating and deactivating operators
- role-aware access for subscription changes, payment recording, and notes
- review ownership fields, reviewed-by timestamps, and bulk unreviewed queue handling
- business-detail forms that write control-plane records and mirror the result back into Tillflow billing fields
- tenant-side Tillflow billing screens that stay visible but no longer act as the primary commercial write surface

## Control auth environment

Set these variables for the internal app:

- `CONTROL_PLANE_ACCESS_KEY` required shared internal sign-in key
- `CONTROL_SESSION_SECRET` optional dedicated cookie signing secret; if omitted, the access key is reused
- `CONTROL_BOOTSTRAP_ADMIN_EMAIL` optional email allowed to create the first `CONTROL_ADMIN` staff record during initial setup

## Run locally

1. Make sure the root workspace dependencies are installed.
2. Change into the app directory.
3. Start the dev server.

```bash
cd tishgroup-control
npm run dev
```

## Deploy separately

Tish Group Control is intended to deploy as its own Vercel project with `tishgroup-control` as the app root.

Required environment variables:

- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `CONTROL_PLANE_ACCESS_KEY`
- `CONTROL_SESSION_SECRET`
- `CONTROL_BOOTSTRAP_ADMIN_EMAIL` (optional)

Recommended Vercel setup:

1. Create a separate Vercel project for the control panel.
2. Point the project root at `tishgroup-control`.
3. Use Node 20 or another version `<24`.
4. Apply the root Prisma migrations to the shared production database before opening the app to staff.

## Suggested next implementation steps

1. Add a true TG business-creation workflow if you want to provision a Tillflow tenant entirely from the control plane instead of from Tillflow signup.
2. Add staff activity history and audit trails across every control-plane write, not just review fields.
3. Add reminder workflows and collections cadences tied to the unreviewed and overdue queues.
4. Deploy on its own internal subdomain, separate from Tillflow.
5. Apply the control-plane migration in every deployed database before relying on payment history and notes.