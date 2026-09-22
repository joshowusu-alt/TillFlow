/**
 * Fail-closed database-target guard for tests, seeds, fixtures and harnesses.
 *
 * Background (22 Sep 2026 incident): the generated Prisma client is built from
 * `prisma/schema.postgres.prisma`, whose datasource is `env("POSTGRES_PRISMA_URL")`
 * with `directUrl = env("POSTGRES_URL_NON_POOLING")`. `DATABASE_URL` is never read
 * by that client. A bare `new PrismaClient()` therefore resolves, in order:
 *   1. an explicit `datasources.db.url` passed to the constructor;
 *   2. `process.env.POSTGRES_PRISMA_URL` already set in the process;
 *   3. `POSTGRES_PRISMA_URL` loaded by the Prisma runtime from the repo `.env`.
 * The repo `.env` carries the Production Neon URLs, so a suite that only set
 * `DATABASE_URL` to Preview wrote to Production.
 *
 * This module has NO Prisma import so it can run before any client exists
 * (vitest globalSetup, setupFiles, `lib/prisma.ts`, plain-node scripts).
 */

export const PRISMA_URL_ENV_KEYS = [
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
] as const;

export type PrismaUrlEnvKey = (typeof PRISMA_URL_ENV_KEYS)[number];

/** Explicit, unambiguous operator choice of the test database. Wins over everything else. */
export const TEST_DATABASE_OVERRIDE_KEY = 'TILLFLOW_TEST_DATABASE_URL';
/** Comma-separated extra `host/database` pairs allowed as isolated test targets. */
export const TEST_DATABASE_ALLOWLIST_KEY = 'TILLFLOW_TEST_DB_ALLOWLIST';
/** Comma-separated extra host fragments that are always refused. */
export const PRODUCTION_DB_HOSTS_KEY = 'TILLFLOW_PRODUCTION_DB_HOSTS';

/** Known Production identifiers. Any match is refused regardless of allowlists. */
export const PRODUCTION_DATABASE_NAMES = ['neondb'];
export const PRODUCTION_HOST_FRAGMENTS = ['fancy-darkness'];

/** Database names that are, by convention, isolated test / Preview targets. */
const ISOLATED_DATABASE_NAME = /^tillflow_(ci|preview|test|walkthrough|qa)([_-][a-z0-9_-]+)?$/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres', 'db', 'host.docker.internal']);

export type DatabaseIdentity = {
  kind: 'postgres' | 'sqlite' | 'unknown' | 'missing';
  host: string;
  /** Neon endpoint id with any `-pooler` suffix removed, so pooled/direct URLs compare equal. */
  endpoint: string;
  database: string;
  schema: string;
  /** Safe to log: never contains credentials. */
  sanitized: string;
};

export class DatabaseTargetRefusedError extends Error {
  readonly identity: DatabaseIdentity | null;
  constructor(message: string, identity: DatabaseIdentity | null) {
    super(`[database-target-guard] REFUSED: ${message}`);
    this.name = 'DatabaseTargetRefusedError';
    this.identity = identity;
  }
}

function stripPoolerSuffix(host: string) {
  return host.replace(/-pooler(?=\.|$)/i, '');
}

export function describeDatabaseUrl(raw: string | undefined | null): DatabaseIdentity {
  const value = raw?.trim() ?? '';
  if (!value) {
    return { kind: 'missing', host: '', endpoint: '', database: '', schema: '', sanitized: '<missing>' };
  }
  const lower = value.toLowerCase();
  if (lower.startsWith('file:') || lower.startsWith('sqlite:')) {
    const database = value.replace(/^(file|sqlite):/i, '').split('?')[0];
    return { kind: 'sqlite', host: '', endpoint: '', database, schema: '', sanitized: `sqlite:${database}` };
  }
  if (lower.startsWith('postgres://') || lower.startsWith('postgresql://')) {
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      const database = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('?')[0] || '');
      const schema = parsed.searchParams.get('schema') || 'public';
      const endpoint = stripPoolerSuffix(host);
      return {
        kind: 'postgres',
        host,
        endpoint,
        database,
        schema,
        sanitized: `postgres://${host}${parsed.port ? ':' + parsed.port : ''}/${database}?schema=${schema}`,
      };
    } catch {
      return { kind: 'unknown', host: '', endpoint: '', database: '', schema: '', sanitized: '<unparseable postgres url>' };
    }
  }
  return { kind: 'unknown', host: '', endpoint: '', database: '', schema: '', sanitized: '<unknown scheme>' };
}

export function sameDatabaseTarget(a: DatabaseIdentity, b: DatabaseIdentity) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'sqlite') return a.database === b.database;
  return a.endpoint === b.endpoint && a.database === b.database && a.schema === b.schema;
}

export type GuardVerdict = {
  ok: boolean;
  reason: string;
  identity: DatabaseIdentity;
};

function splitList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Decide whether a single URL is an acceptable target for test writes.
 * Deny rules always win over allow rules.
 */
export function evaluateDatabaseTarget(raw: string | undefined | null, env: NodeJS.ProcessEnv = process.env): GuardVerdict {
  const identity = describeDatabaseUrl(raw);
  if (env.VERCEL_ENV === 'production') {
    return { ok: false, reason: 'VERCEL_ENV=production — test writes are never allowed in the Production environment', identity };
  }
  if (identity.kind === 'missing') return { ok: false, reason: 'database URL is missing', identity };
  if (identity.kind === 'unknown') return { ok: false, reason: 'database URL has an unrecognised scheme', identity };
  if (identity.kind === 'sqlite') return { ok: true, reason: 'sqlite file database', identity };

  const denyHosts = [...PRODUCTION_HOST_FRAGMENTS, ...splitList(env[PRODUCTION_DB_HOSTS_KEY])];
  if (PRODUCTION_DATABASE_NAMES.includes(identity.database.toLowerCase())) {
    return { ok: false, reason: `database "${identity.database}" is the Production database name`, identity };
  }
  if (denyHosts.some((fragment) => identity.host.includes(fragment))) {
    return { ok: false, reason: `host "${identity.host}" matches a known Production endpoint`, identity };
  }

  const allowPairs = splitList(env[TEST_DATABASE_ALLOWLIST_KEY]);
  const pair = `${identity.host}/${identity.database}`.toLowerCase();
  const endpointPair = `${identity.endpoint}/${identity.database}`.toLowerCase();
  if (allowPairs.includes(pair) || allowPairs.includes(endpointPair)) {
    return { ok: true, reason: `explicitly allowlisted via ${TEST_DATABASE_ALLOWLIST_KEY}`, identity };
  }
  if (LOCAL_HOSTS.has(identity.host)) {
    return { ok: true, reason: 'local Postgres host', identity };
  }
  if (ISOLATED_DATABASE_NAME.test(identity.database)) {
    return { ok: true, reason: `isolated test database name "${identity.database}"`, identity };
  }
  return {
    ok: false,
    reason: `"${identity.sanitized}" is not an allowlisted isolated test/Preview database`,
    identity,
  };
}

export type ResolvedTestTarget = {
  url: string;
  identity: DatabaseIdentity;
  source: 'override' | 'DATABASE_URL';
  verdict: GuardVerdict;
  /** Env keys whose value disagreed with the chosen target before pinning. */
  contradictions: Array<{ key: string; sanitized: string }>;
};

/**
 * Resolve the single URL every Prisma client in this process is allowed to use.
 *
 * - `TILLFLOW_TEST_DATABASE_URL` is an explicit operator choice and wins.
 * - Otherwise `DATABASE_URL` is the candidate, and every other Prisma URL variable that is
 *   set must agree with it (pooled/direct hosts compare equal). Any disagreement is a
 *   contradiction and is refused: the caller cannot know which database Prisma would use.
 * - The chosen URL must pass {@link evaluateDatabaseTarget}.
 *
 * Nothing is mutated here; see {@link pinPrismaEnv}.
 */
export function resolveTestDatabaseTarget(
  env: NodeJS.ProcessEnv = process.env,
  options: { requirePostgres?: boolean } = {},
): ResolvedTestTarget {
  const override = env[TEST_DATABASE_OVERRIDE_KEY]?.trim();
  const source: ResolvedTestTarget['source'] = override ? 'override' : 'DATABASE_URL';
  const url = override || env.DATABASE_URL?.trim() || '';
  const identity = describeDatabaseUrl(url);
  const verdict = evaluateDatabaseTarget(url, env);

  const contradictions: ResolvedTestTarget['contradictions'] = [];
  if (!override) {
    for (const key of PRISMA_URL_ENV_KEYS) {
      if (key === 'DATABASE_URL') continue;
      const other = env[key]?.trim();
      if (!other) continue;
      const otherIdentity = describeDatabaseUrl(other);
      if (!sameDatabaseTarget(identity, otherIdentity)) {
        contradictions.push({ key, sanitized: otherIdentity.sanitized });
      }
    }
  }

  if (!verdict.ok) {
    throw new DatabaseTargetRefusedError(`${verdict.reason} (source ${source}: ${identity.sanitized})`, identity);
  }
  if (options.requirePostgres && identity.kind !== 'postgres') {
    throw new DatabaseTargetRefusedError(
      `a Postgres test database is required but ${source} resolves to ${identity.sanitized}`,
      identity,
    );
  }
  if (contradictions.length > 0) {
    const detail = contradictions.map((c) => `${c.key}=${c.sanitized}`).join(', ');
    throw new DatabaseTargetRefusedError(
      `contradictory database identity — DATABASE_URL=${identity.sanitized} but ${detail}. ` +
        `Set ${TEST_DATABASE_OVERRIDE_KEY} explicitly to the isolated test database, or make every Prisma URL agree.`,
      identity,
    );
  }
  return { url, identity, source, verdict, contradictions };
}

/**
 * Pin every environment variable a generated Prisma client (or any helper) could read to
 * ONE url, so neither `new PrismaClient()` nor `@/lib/prisma` can fall back to `.env`.
 * Returns the keys that changed (for evidence logging).
 */
export function pinPrismaEnv(env: NodeJS.ProcessEnv, url: string): string[] {
  const changed: string[] = [];
  for (const key of PRISMA_URL_ENV_KEYS) {
    if (env[key] !== url) {
      env[key] = url;
      changed.push(key);
    }
  }
  return changed;
}

export type PreparedTestDatabaseEnv = ResolvedTestTarget & { pinnedKeys: string[] };

/**
 * Resolve + guard + pin in one step. Throws {@link DatabaseTargetRefusedError} before touching env
 * when the target is refused, so a refused process never has a consistent-looking environment.
 */
export function prepareTestDatabaseEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: { requirePostgres?: boolean } = {},
): PreparedTestDatabaseEnv {
  const resolved = resolveTestDatabaseTarget(env, options);
  const pinnedKeys = pinPrismaEnv(env, resolved.url);
  return { ...resolved, pinnedKeys };
}

/**
 * Re-check, after pinning, that every Prisma URL variable that is set resolves to the same
 * guarded identity. Used immediately before constructing a client.
 */
export function assertPrismaEnvPinned(env: NodeJS.ProcessEnv, expected: DatabaseIdentity) {
  for (const key of PRISMA_URL_ENV_KEYS) {
    const value = env[key]?.trim();
    if (!value) continue;
    const identity = describeDatabaseUrl(value);
    if (!sameDatabaseTarget(identity, expected)) {
      throw new DatabaseTargetRefusedError(
        `${key} resolves to ${identity.sanitized}, expected ${expected.sanitized}`,
        identity,
      );
    }
  }
}

export function formatGuardLine(prepared: PreparedTestDatabaseEnv) {
  return (
    `[database-target-guard] OK target=${prepared.identity.sanitized} source=${prepared.source} ` +
    `reason="${prepared.verdict.reason}" pinned=[${prepared.pinnedKeys.join(',') || 'none'}]`
  );
}
