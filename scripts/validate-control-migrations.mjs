/**
 * Validate ControlStaff auth / ControlAuditLog migration on isolated Postgres:
 * empty migrate-deploy, current-schema idempotent re-apply, raw-DDL adoption,
 * and incompatible-shape failure.
 * Never prints connection strings or secrets.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'prisma', 'migrations');
const phase0Name = '20260904160000_control_staff_auth_and_audit';
const phase0Sql = readFileSync(join(migrationsDir, phase0Name, 'migration.sql'), 'utf8');

function classifyDatabaseUrl(url) {
  if (!url) return 'missing';
  try {
    const parsed = new URL(url.replace(/^prisma\+/, ''));
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return 'loopback';
    if (hostname === 'postgres' || hostname === 'db' || hostname.endsWith('.local')) return 'local-network';
    return 'remote';
  } catch {
    return 'unparseable';
  }
}

function sourceUrl() {
  return process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL || '';
}

function withDatabaseName(url, name) {
  const parsed = new URL(url.replace(/^prisma\+/, ''));
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

function maintenanceUrl(url) {
  return withDatabaseName(url, 'postgres');
}

async function withClient(url, fn) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function recreateDatabase(adminUrl, name) {
  await withClient(adminUrl, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${name}`);
    await client.query(`CREATE DATABASE ${name}`);
  });
}

function migrationFolders() {
  return readdirSync(migrationsDir)
    .filter((name) => /^\d/.test(name))
    .sort();
}

async function applySqlFile(client, filePath) {
  const sql = readFileSync(filePath, 'utf8');
  await client.query(sql);
}

async function applyAllMigrationsExceptPhase0(url) {
  await withClient(url, async (client) => {
    for (const folder of migrationFolders()) {
      if (folder === phase0Name) continue;
      await applySqlFile(client, join(migrationsDir, folder, 'migration.sql'));
    }
  });
}

async function columnType(client, table, column) {
  const result = await client.query(
    `SELECT data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return result.rows[0]?.data_type ?? null;
}

async function assertAdopted(url) {
  await withClient(url, async (client) => {
    const sessionVersion = await columnType(client, 'ControlStaff', 'sessionVersion');
    const passwordHash = await columnType(client, 'ControlStaff', 'passwordHash');
    const audit = await client.query(`SELECT to_regclass('public."ControlAuditLog"') AS name`);
    const paymentKey = await columnType(client, 'ControlPayment', 'idempotencyKey');
    if (sessionVersion !== 'integer') throw new Error('sessionVersion was not adopted as integer');
    if (passwordHash !== 'text') throw new Error('passwordHash was not adopted as text');
    if (!audit.rows[0]?.name) throw new Error('ControlAuditLog was not created');
    if (paymentKey !== 'text') throw new Error('ControlPayment.idempotencyKey was not adopted');
  });
}

function migrateDeploy(url) {
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['prisma', 'migrate', 'deploy', '--schema=prisma/schema.postgres.prisma'],
    {
      cwd: root,
      env: {
        ...process.env,
        POSTGRES_PRISMA_URL: url,
        POSTGRES_URL_NON_POOLING: url,
        DATABASE_URL: url,
      },
      stdio: 'pipe',
    },
  );
}

const RAW_DDL = `
ALTER TABLE "ControlStaff"
  ADD COLUMN IF NOT EXISTS "passwordHash" TEXT,
  ADD COLUMN IF NOT EXISTS "passwordSetAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ControlAuditLog" (
  "id" TEXT NOT NULL,
  "staffId" TEXT,
  "staffEmail" TEXT NOT NULL,
  "staffRole" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "businessId" TEXT,
  "summary" TEXT NOT NULL,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ControlAuditLog_pkey" PRIMARY KEY ("id")
);
`;

async function main() {
  const url = sourceUrl();
  const classification = classifyDatabaseUrl(url);
  if (classification !== 'loopback' && classification !== 'local-network' && process.env.CONTROL_PREVIEW_ISOLATED_DB !== '1') {
    console.error('PHASE 0 BLOCKED — ISOLATED PREVIEW DATABASE REQUIRED');
    process.exit(1);
  }

  const adminUrl = maintenanceUrl(url);

  console.log('validate-control-migrations: empty database via prisma migrate deploy');
  await recreateDatabase(adminUrl, 'tishgroup_ci_empty');
  migrateDeploy(withDatabaseName(url, 'tishgroup_ci_empty'));
  await assertAdopted(withDatabaseName(url, 'tishgroup_ci_empty'));

  console.log('validate-control-migrations: current-schema clone, idempotent phase0 re-apply');
  await recreateDatabase(adminUrl, 'tishgroup_ci_current');
  migrateDeploy(withDatabaseName(url, 'tishgroup_ci_current'));
  await withClient(withDatabaseName(url, 'tishgroup_ci_current'), async (client) => {
    await client.query(phase0Sql);
  });
  await assertAdopted(withDatabaseName(url, 'tishgroup_ci_current'));

  console.log('validate-control-migrations: prior migrations + raw DDL, then phase0 adopt');
  await recreateDatabase(adminUrl, 'tishgroup_ci_rawddl');
  const rawUrl = withDatabaseName(url, 'tishgroup_ci_rawddl');
  await applyAllMigrationsExceptPhase0(rawUrl);
  await withClient(rawUrl, async (client) => {
    await client.query(RAW_DDL);
    await client.query(phase0Sql);
  });
  await assertAdopted(rawUrl);

  console.log('validate-control-migrations: incompatible passwordHash type fails closed');
  await recreateDatabase(adminUrl, 'tishgroup_ci_incompatible');
  const badUrl = withDatabaseName(url, 'tishgroup_ci_incompatible');
  await applyAllMigrationsExceptPhase0(badUrl);
  let failedClosed = false;
  try {
    await withClient(badUrl, async (client) => {
      await client.query(`ALTER TABLE "ControlStaff" ADD COLUMN "passwordHash" INTEGER`);
      await client.query(phase0Sql);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('incompatible type')) {
      failedClosed = true;
    } else {
      throw error;
    }
  }
  if (!failedClosed) {
    throw new Error('Expected incompatible passwordHash to fail closed');
  }

  console.log('validate-control-migrations: pass');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'unknown error';
  const safe = message.replace(/postgres(ql)?:\/\/[^\s]+/gi, '[redacted]');
  console.error('validate-control-migrations: fail');
  console.error(safe);
  process.exit(1);
});
