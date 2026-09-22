/**
 * Guarded Prisma client for plain-node scripts, seeds, fixtures and Cursor harnesses.
 * CommonJS mirror of `lib/database-target-guard.ts` (same deny/allow rules) so scripts that
 * cannot import TypeScript still fail closed.
 *
 *   const { openGuardedPrismaClient } = require('./scripts/lib/guarded-prisma.cjs');
 *   const { prisma, identity } = await openGuardedPrismaClient({ url: process.env.TILLFLOW_TEST_DATABASE_URL });
 *
 * Rules
 *  - Production is refused: database `neondb`, host fragment `fancy-darkness`, VERCEL_ENV=production,
 *    plus anything in TILLFLOW_PRODUCTION_DB_HOSTS.
 *  - Only allowlisted targets pass: local hosts, `tillflow_(ci|preview|test|walkthrough|qa)*`
 *    database names, or TILLFLOW_TEST_DB_ALLOWLIST `host/db` pairs.
 *  - Read-only Production access is possible ONLY with `{ readOnly: true }` AND
 *    TILLFLOW_ALLOW_PRODUCTION_READ=1; the session is then forced READ ONLY server-side.
 *  - Every Prisma URL env variable is pinned to the chosen url, the client is constructed with
 *    an explicit datasource, and `current_database()` is verified before the client is returned.
 */
const PRISMA_URL_ENV_KEYS = [
  'DATABASE_URL',
  'DIRECT_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
  'POSTGRES_URL_NO_SSL',
  'PRISMA_DATABASE_URL',
  'SUPPLIER_PAYMENT_CONCURRENCY_DATABASE_URL',
  'INVENTORY_INCREASE_CONCURRENCY_DATABASE_URL',
  'MIGRATION_SLICE2B_DATABASE_URL',
];
const PRODUCTION_DATABASE_NAMES = ['neondb'];
const PRODUCTION_HOST_FRAGMENTS = ['fancy-darkness'];
const ISOLATED_DATABASE_NAME = /^tillflow_(ci|preview|test|walkthrough|qa)([_-][a-z0-9_-]+)?$/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres', 'db', 'host.docker.internal']);

function describeDatabaseUrl(raw) {
  const value = (raw || '').trim();
  if (!value) return { kind: 'missing', host: '', database: '', sanitized: '<missing>' };
  const lower = value.toLowerCase();
  if (lower.startsWith('file:') || lower.startsWith('sqlite:')) {
    const database = value.replace(/^(file|sqlite):/i, '').split('?')[0];
    return { kind: 'sqlite', host: '', database, sanitized: `sqlite:${database}` };
  }
  if (lower.startsWith('postgres://') || lower.startsWith('postgresql://')) {
    try {
      const u = new URL(value);
      const host = u.hostname.toLowerCase();
      const database = decodeURIComponent(u.pathname.replace(/^\//, '').split('?')[0] || '');
      const schema = u.searchParams.get('schema') || 'public';
      return { kind: 'postgres', host, endpoint: host.replace(/-pooler(?=\.|$)/i, ''), database, schema, sanitized: `postgres://${host}${u.port ? ':' + u.port : ''}/${database}?schema=${schema}` };
    } catch {
      return { kind: 'unknown', host: '', database: '', sanitized: '<unparseable>' };
    }
  }
  return { kind: 'unknown', host: '', database: '', sanitized: '<unknown scheme>' };
}

function splitList(v) {
  return String(v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function isProductionTarget(identity, env = process.env) {
  if (identity.kind !== 'postgres') return false;
  const denyHosts = [...PRODUCTION_HOST_FRAGMENTS, ...splitList(env.TILLFLOW_PRODUCTION_DB_HOSTS)];
  return PRODUCTION_DATABASE_NAMES.includes(identity.database.toLowerCase()) || denyHosts.some((f) => identity.host.includes(f));
}

function evaluateDatabaseTarget(raw, env = process.env) {
  const identity = describeDatabaseUrl(raw);
  if (env.VERCEL_ENV === 'production') return { ok: false, reason: 'VERCEL_ENV=production', identity };
  if (identity.kind === 'missing') return { ok: false, reason: 'database URL is missing', identity };
  if (identity.kind === 'unknown') return { ok: false, reason: 'unrecognised scheme', identity };
  if (identity.kind === 'sqlite') return { ok: true, reason: 'sqlite file database', identity };
  if (isProductionTarget(identity, env)) return { ok: false, reason: `${identity.sanitized} is a Production target`, identity };
  const allow = splitList(env.TILLFLOW_TEST_DB_ALLOWLIST);
  if (allow.includes(`${identity.host}/${identity.database}`) || allow.includes(`${identity.endpoint}/${identity.database}`)) return { ok: true, reason: 'allowlisted', identity };
  if (LOCAL_HOSTS.has(identity.host)) return { ok: true, reason: 'local Postgres host', identity };
  if (ISOLATED_DATABASE_NAME.test(identity.database)) return { ok: true, reason: `isolated database name ${identity.database}`, identity };
  return { ok: false, reason: `${identity.sanitized} is not an allowlisted isolated test/Preview database`, identity };
}

function pinPrismaEnv(env, url) {
  const changed = [];
  for (const key of PRISMA_URL_ENV_KEYS) {
    if (env[key] !== url) {
      env[key] = url;
      changed.push(key);
    }
  }
  return changed;
}

class DatabaseTargetRefusedError extends Error {
  constructor(message, identity) {
    super(`[database-target-guard] REFUSED: ${message}`);
    this.name = 'DatabaseTargetRefusedError';
    this.identity = identity;
  }
}

/**
 * @param {{ url?: string, readOnly?: boolean, env?: NodeJS.ProcessEnv, log?: (line: string) => void, PrismaClient?: any }} options
 */
async function openGuardedPrismaClient(options = {}) {
  const env = options.env || process.env;
  const log = options.log || ((line) => console.info(line));
  const url = (options.url || env.TILLFLOW_TEST_DATABASE_URL || env.DATABASE_URL || '').trim();
  const identity = describeDatabaseUrl(url);
  const production = isProductionTarget(identity, env);
  const readOnly = options.readOnly === true;

  if (production) {
    if (!(readOnly && env.TILLFLOW_ALLOW_PRODUCTION_READ === '1')) {
      throw new DatabaseTargetRefusedError(`${identity.sanitized} is Production; only { readOnly: true } with TILLFLOW_ALLOW_PRODUCTION_READ=1 may open it`, identity);
    }
  } else {
    const verdict = evaluateDatabaseTarget(url, env);
    if (!verdict.ok) throw new DatabaseTargetRefusedError(verdict.reason, identity);
  }

  const pinned = production ? [] : pinPrismaEnv(env, url);
  const { PrismaClient } = options.PrismaClient ? { PrismaClient: options.PrismaClient } : require('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  if (readOnly) await prisma.$executeRawUnsafe('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  if (identity.kind === 'postgres') {
    const [row] = await prisma.$queryRawUnsafe('SELECT current_database() AS db, current_setting(\'transaction_read_only\') AS ro');
    if (row.db !== identity.database) {
      await prisma.$disconnect().catch(() => undefined);
      throw new DatabaseTargetRefusedError(`connected database "${row.db}" differs from ${identity.sanitized}`, identity);
    }
    if (readOnly && row.ro !== 'on') {
      await prisma.$disconnect().catch(() => undefined);
      throw new DatabaseTargetRefusedError('read-only session could not be established', identity);
    }
  }
  log(`[database-target-guard] OK target=${identity.sanitized} mode=${production ? 'PRODUCTION-READ-ONLY' : readOnly ? 'read-only' : 'read-write'} pinned=[${pinned.join(',') || 'none'}]`);
  return { prisma, identity, url, readOnly, production };
}

module.exports = {
  PRISMA_URL_ENV_KEYS,
  DatabaseTargetRefusedError,
  describeDatabaseUrl,
  evaluateDatabaseTarget,
  isProductionTarget,
  pinPrismaEnv,
  openGuardedPrismaClient,
};
