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

/**
 * Known isolated Neon branches used for Preview / walkthrough proofs. A REMOTE host is only
 * allowed when its endpoint contains one of these fragments (or is explicitly allowlisted via
 * `TILLFLOW_TEST_DB_ALLOWLIST`) AND its database name follows the isolated naming convention.
 * A new Neon compute id — including a future Production one — is therefore refused by default.
 */
export const ISOLATED_PREVIEW_ENDPOINT_FRAGMENTS = ['old-sunset', 'late-cell'];

/** Every isolated branch we know lives under this Neon domain. */
export const ISOLATED_PREVIEW_HOST_SUFFIX = '.neon.tech';

/**
 * True only when `host` is a Neon endpoint for a known isolated branch: first label
 * `ep-<fragment>-<id>` with an optional `-pooler` suffix AND the host ends in `.neon.tech`.
 * Anchored on purpose — neither `late-cell.example.com` nor `ep-late-cell-1.attacker.net` qualifies.
 * Returns the matching fragment or null.
 */
export function knownIsolatedEndpointFragment(host: string): string | null {
  const lower = host.toLowerCase();
  if (!lower.endsWith(ISOLATED_PREVIEW_HOST_SUFFIX)) return null;
  const label = lower.split('.')[0];
  for (const fragment of ISOLATED_PREVIEW_ENDPOINT_FRAGMENTS) {
    if (new RegExp(`^ep-${fragment}-[a-z0-9]+(-pooler)?$`).test(label)) return fragment;
  }
  return null;
}

/** Database names that are, by convention, isolated test / Preview targets. */
const ISOLATED_DATABASE_NAME = /^tillflow_(ci|preview|test|walkthrough|qa)([_-][a-z0-9_-]+)?$/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres', 'db', 'host.docker.internal']);

export type DatabaseIdentity = {
  kind: 'postgres' | 'sqlite' | 'unknown' | 'missing';
  host: string;
  /** Neon endpoint id (host with any `-pooler` suffix removed, plus port), so pooled/direct URLs compare equal. */
  endpoint: string;
  database: string;
  schema: string;
  /** Safe to log: never contains credentials. */
  sanitized: string;
  /** Full URL, lower-cased, with credentials stripped — used for deny-fragment matching only. */
  redactedUrl: string;
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

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Query parameters that can carry secrets; never kept in anything that may be logged. */
const SECRET_QUERY_KEYS = new Set(['sslpassword', 'password', 'passfile', 'sslkey']);

/**
 * Credential-free, lower-cased text used ONLY for deny-fragment matching. Built from the host,
 * the path and the query decoded PER PAIR via URLSearchParams (which never throws and decodes
 * each value independently), followed by the raw lower-cased query. A single malformed `%zz`
 * elsewhere in the URL therefore cannot disable decoding of an `options=endpoint=…` value.
 */
function buildRedactedUrl(parsed: URL, raw: string): string {
  const pairs: string[] = [];
  for (const [key, val] of parsed.searchParams) {
    if (SECRET_QUERY_KEYS.has(key.toLowerCase())) continue;
    pairs.push(`${key}=${val}`);
  }
  const rawQuery = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  const rawQueryNoSecrets = rawQuery
    .split('&')
    // decode the key before the secret check so `sslpasswor%64=` cannot smuggle a value through
    .filter((part) => !SECRET_QUERY_KEYS.has(safeDecode(part.split('=')[0]).toLowerCase()))
    .join('&');
  return `${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}${parsed.pathname}?${pairs.join('&')}#${rawQueryNoSecrets}`.toLowerCase();
}

/**
 * Decoded, lower-cased userinfo (username + password) for deny matching ONLY — never stored on the
 * identity and never logged. Neon's SNI-less workaround embeds the endpoint id in the password
 * (`password=endpoint=ep-…$secret`), so a Production endpoint id can hide there.
 */
function userinfoDenyText(raw: string): string {
  try {
    const parsed = new URL(raw.trim());
    return `${safeDecode(parsed.username)} ${safeDecode(parsed.password)}`.toLowerCase();
  } catch {
    return '';
  }
}

function blank(kind: DatabaseIdentity['kind'], sanitized: string): DatabaseIdentity {
  return { kind, host: '', endpoint: '', database: '', schema: '', sanitized, redactedUrl: '' };
}

export function describeDatabaseUrl(raw: string | undefined | null): DatabaseIdentity {
  const value = raw?.trim() ?? '';
  if (!value) return blank('missing', '<missing>');
  const lower = value.toLowerCase();
  if (lower.startsWith('file:') || lower.startsWith('sqlite:')) {
    const database = value.replace(/^(file|sqlite):/i, '').split('?')[0];
    return { kind: 'sqlite', host: '', endpoint: '', database, schema: '', sanitized: `sqlite:${database}`, redactedUrl: lower };
  }
  if (lower.startsWith('postgres://') || lower.startsWith('postgresql://')) {
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      // Prisma (quaint) uses the FIRST path segment as the database name; so do we.
      const database = safeDecode(parsed.pathname.replace(/^\//, '').split('/')[0].split('?')[0] || '');
      const schema = parsed.searchParams.get('schema') || 'public';
      const endpoint = `${stripPoolerSuffix(host)}${parsed.port ? ':' + parsed.port : ''}`;
      return {
        kind: 'postgres',
        host,
        endpoint,
        database,
        schema,
        sanitized: `postgres://${host}${parsed.port ? ':' + parsed.port : ''}/${database}?schema=${schema}`,
        redactedUrl: buildRedactedUrl(parsed, value),
      };
    } catch {
      return blank('unknown', '<unparseable postgres url>');
    }
  }
  return blank('unknown', '<unknown scheme>');
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

  const denyFragments = [...PRODUCTION_HOST_FRAGMENTS, ...splitList(env[PRODUCTION_DB_HOSTS_KEY])];
  if (PRODUCTION_DATABASE_NAMES.includes(identity.database.toLowerCase())) {
    return { ok: false, reason: `database "${identity.database}" is the Production database name`, identity };
  }
  // Match deny fragments against the WHOLE redacted URL, not just the hostname: Neon also
  // routes on `options=endpoint=ep-…`, so a Production endpoint id anywhere in the URL is refused.
  const userinfo = userinfoDenyText(raw ?? '');
  const denied = denyFragments.find((fragment) => identity.redactedUrl.includes(fragment) || userinfo.includes(fragment));
  if (denied) {
    return { ok: false, reason: `URL contains known Production endpoint fragment "${denied}"`, identity };
  }

  const allowPairs = splitList(env[TEST_DATABASE_ALLOWLIST_KEY]);
  const pair = `${identity.host}/${identity.database}`.toLowerCase();
  const endpointPair = `${identity.endpoint}/${identity.database}`.toLowerCase();
  const endpointNoPortPair = `${identity.endpoint.split(':')[0]}/${identity.database}`.toLowerCase();
  if (allowPairs.includes(pair) || allowPairs.includes(endpointPair) || allowPairs.includes(endpointNoPortPair)) {
    return { ok: true, reason: `explicitly allowlisted via ${TEST_DATABASE_ALLOWLIST_KEY}`, identity };
  }
  if (LOCAL_HOSTS.has(identity.host)) {
    return { ok: true, reason: 'local Postgres host', identity };
  }
  // Remote hosts: BOTH a known isolated endpoint AND an isolated database name are required.
  const knownIsolatedEndpoint = knownIsolatedEndpointFragment(identity.host);
  if (knownIsolatedEndpoint && ISOLATED_DATABASE_NAME.test(identity.database)) {
    return {
      ok: true,
      reason: `known isolated Preview endpoint "${knownIsolatedEndpoint}" with isolated database name "${identity.database}"`,
      identity,
    };
  }
  return {
    ok: false,
    reason: `"${identity.sanitized}" is not an allowlisted isolated test/Preview database (remote hosts need a known isolated endpoint or ${TEST_DATABASE_ALLOWLIST_KEY})`,
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
