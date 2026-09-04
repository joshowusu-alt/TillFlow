/**
 * Create or verify the disposable-database sentinel on the isolated Preview
 * clone only. Never prints connection strings. Cannot target Production.
 */
import { PrismaClient } from '@prisma/client';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DISPOSABLE_SENTINEL_ID,
  DISPOSABLE_SENTINEL_LABEL,
  DISPOSABLE_SENTINEL_TABLE,
  ISOLATED_PREVIEW_FINGERPRINT,
  assertDisposableRemoteTarget,
  assertNoForceEscapeHatch,
  redactDatabaseText,
} from './lib/database-target.mjs';

function argValue(name) {
  const prefix = `${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  if (matched) return matched.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }
  return null;
}

function fail(message) {
  console.error(redactDatabaseText(message));
  process.exit(1);
}

try {
  assertNoForceEscapeHatch(process.argv, process.env);
} catch (error) {
  fail(error instanceof Error ? error.message : 'Force flag refused.');
}

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL || '';

try {
  assertDisposableRemoteTarget({
    env: process.env,
    databaseUrl,
    expectedHostPrefix: argValue('--expected-host-prefix') || ISOLATED_PREVIEW_FINGERPRINT.hostPrefix,
    expectedDatabase: argValue('--expected-database') || ISOLATED_PREVIEW_FINGERPRINT.databaseName,
    expectedUser: argValue('--expected-user') || ISOLATED_PREVIEW_FINGERPRINT.user,
    confirmTarget: argValue('--confirm-target'),
  });
} catch (error) {
  fail(error instanceof Error ? error.message : 'Disposable target refused.');
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${DISPOSABLE_SENTINEL_TABLE}" (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${DISPOSABLE_SENTINEL_TABLE}" (id, label)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label`,
    DISPOSABLE_SENTINEL_ID,
    DISPOSABLE_SENTINEL_LABEL,
  );
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, label FROM "${DISPOSABLE_SENTINEL_TABLE}" WHERE id = $1`,
    DISPOSABLE_SENTINEL_ID,
  );
  const label = Array.isArray(rows) ? rows[0]?.label : null;
  if (label !== DISPOSABLE_SENTINEL_LABEL) {
    throw new Error('Sentinel write did not persist the expected label.');
  }
  console.log(JSON.stringify({ ok: true, sentinel: DISPOSABLE_SENTINEL_LABEL }));
} catch (error) {
  fail(error instanceof Error ? error.message : 'Sentinel write failed.');
} finally {
  await prisma.$disconnect();
}
