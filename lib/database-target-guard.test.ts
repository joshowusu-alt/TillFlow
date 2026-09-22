import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  assertPrismaEnvPinned,
  DatabaseTargetRefusedError,
  describeDatabaseUrl,
  evaluateDatabaseTarget,
  knownIsolatedEndpointFragment,
  pinPrismaEnv,
  prepareTestDatabaseEnv,
  PRISMA_URL_ENV_KEYS,
  resolveTestDatabaseTarget,
  sameDatabaseTarget,
  TEST_DATABASE_ALLOWLIST_KEY,
  TEST_DATABASE_OVERRIDE_KEY,
} from './database-target-guard';

// Shapes copied from the real incident (credentials replaced).
const PROD_POOLED = 'postgresql://user:secret@ep-fancy-darkness-abyuvjxt-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require';
const PROD_DIRECT = 'postgresql://user:secret@ep-fancy-darkness-abyuvjxt.eu-west-2.aws.neon.tech/neondb?sslmode=require';
const PREVIEW = 'postgresql://user:secret@ep-late-cell-abcd1234.eu-west-2.aws.neon.tech/tillflow_preview?sslmode=require';
const PREVIEW_POOLED = 'postgresql://user:secret@ep-late-cell-abcd1234-pooler.eu-west-2.aws.neon.tech/tillflow_preview?sslmode=require';
const CI = 'postgresql://postgres:postgres@localhost:5432/tillflow_ci?schema=public';
const SQLITE = 'file:./ci-unit.db';

const env = (overrides: Record<string, string | undefined>): NodeJS.ProcessEnv => ({ ...overrides }) as unknown as NodeJS.ProcessEnv;

describe('describeDatabaseUrl', () => {
  it('never exposes credentials in the sanitised form', () => {
    const id = describeDatabaseUrl(PROD_POOLED);
    expect(id.sanitized).not.toContain('secret');
    expect(id.sanitized).not.toContain('user:');
    expect(id.kind).toBe('postgres');
    expect(id.database).toBe('neondb');
  });

  it('treats pooled and direct Neon endpoints as the same target', () => {
    expect(sameDatabaseTarget(describeDatabaseUrl(PROD_POOLED), describeDatabaseUrl(PROD_DIRECT))).toBe(true);
    expect(sameDatabaseTarget(describeDatabaseUrl(PREVIEW), describeDatabaseUrl(PREVIEW_POOLED))).toBe(true);
    expect(sameDatabaseTarget(describeDatabaseUrl(PREVIEW), describeDatabaseUrl(PROD_DIRECT))).toBe(false);
  });

  it('classifies sqlite, missing and unknown schemes', () => {
    expect(describeDatabaseUrl(SQLITE).kind).toBe('sqlite');
    expect(describeDatabaseUrl('').kind).toBe('missing');
    expect(describeDatabaseUrl(undefined).kind).toBe('missing');
    expect(describeDatabaseUrl('mysql://x/y').kind).toBe('unknown');
  });

  it('takes the database name from the FIRST path segment, exactly as Prisma does', () => {
    expect(describeDatabaseUrl('postgresql://u:p@localhost/neondb/').database).toBe('neondb');
    expect(describeDatabaseUrl('postgresql://u:p@localhost/neondb/extra').database).toBe('neondb');
    expect(describeDatabaseUrl('postgresql://u:p@localhost/till%5Fflow_ci').database).toBe('till_flow_ci');
    expect(describeDatabaseUrl('postgresql://u:p@localhost/bad%zz').database).toBe('bad%zz'); // malformed escapes do not throw
  });

  it('exposes a credential-free redacted URL for deny matching', () => {
    const id = describeDatabaseUrl(PROD_POOLED);
    expect(id.redactedUrl).not.toContain('secret');
    expect(id.redactedUrl).not.toContain('user');
    expect(id.redactedUrl).toContain('fancy-darkness');
  });

  it('strips secret-bearing query parameters from the redacted URL (it rides on thrown errors)', () => {
    const id = describeDatabaseUrl(
      'postgresql://user:secret@localhost/tillflow_ci?sslpassword=pem-secret&SSLPASSWORD=pem-secret2&password=p%40ss&passfile=/tmp/pgpass&sslkey=/k&sslmode=require',
    );
    expect(id.redactedUrl).not.toContain('pem-secret');
    expect(id.redactedUrl).not.toContain('p@ss');
    expect(id.redactedUrl).not.toContain('pgpass');
    expect(id.redactedUrl).not.toContain('/k');
    expect(id.redactedUrl).toContain('sslmode=require');
    expect(JSON.stringify(new DatabaseTargetRefusedError('x', id))).not.toContain('pem-secret');
  });

  it('decodes query values per pair so one malformed escape cannot hide an encoded endpoint id', () => {
    const id = describeDatabaseUrl('postgresql://u:p@localhost/tillflow_ci?options=endpoint%3Dep-fancy%2Ddarkness-1&x=%zz');
    expect(id.redactedUrl).toContain('endpoint=ep-fancy-darkness-1');
  });

  it('knownIsolatedEndpointFragment is anchored to `ep-<fragment>-<id>[-pooler].…neon.tech`', () => {
    expect(knownIsolatedEndpointFragment('ep-late-cell-za9kodq1.c-2.eu-west-2.aws.neon.tech')).toBe('late-cell');
    expect(knownIsolatedEndpointFragment('ep-late-cell-za9kodq1-pooler.c-2.eu-west-2.aws.neon.tech')).toBe('late-cell');
    expect(knownIsolatedEndpointFragment('EP-OLD-SUNSET-abc123.eu-west-2.aws.neon.tech')).toBe('old-sunset');
    expect(knownIsolatedEndpointFragment('late-cell.example.com')).toBeNull();
    expect(knownIsolatedEndpointFragment('ep-late-cell-1.attacker.net')).toBeNull();
    expect(knownIsolatedEndpointFragment('ep-late-cell-1.neon.tech.attacker.net')).toBeNull();
    expect(knownIsolatedEndpointFragment('xep-late-cell-1.eu-west-2.aws.neon.tech')).toBeNull();
    expect(knownIsolatedEndpointFragment('ep-fancy-darkness-abyuvjxt.eu-west-2.aws.neon.tech')).toBeNull();
  });

  it('a different port is a different target', () => {
    expect(
      sameDatabaseTarget(describeDatabaseUrl('postgresql://u:p@localhost:5432/x'), describeDatabaseUrl('postgresql://u:p@localhost:5433/x')),
    ).toBe(false);
  });
});

describe('evaluateDatabaseTarget — Production-like URLs fail closed', () => {
  it.each([
    ['production pooled endpoint', PROD_POOLED],
    ['production direct endpoint', PROD_DIRECT],
    ['neondb on any other host', 'postgresql://u:p@ep-other-1234.eu-west-2.aws.neon.tech/neondb'],
    ['neondb on localhost', 'postgresql://u:p@localhost:5432/neondb'],
    ['un-allowlisted remote database', 'postgresql://u:p@db.example.com:5432/tillflow'],
    ['un-allowlisted Neon database name', 'postgresql://u:p@ep-quiet-sea-1234.eu-west-2.aws.neon.tech/tillflow'],
    ['missing url', ''],
    ['unknown scheme', 'mysql://u:p@localhost/tillflow_ci'],
    // WS6 finding 1: trailing-slash / extra-segment evasion of the name deny list
    ['neondb hidden behind a trailing slash', 'postgresql://u:p@ep-late-cell-1234.eu-west-2.aws.neon.tech/neondb/'],
    ['neondb hidden behind an extra path segment', 'postgresql://u:p@ep-late-cell-1234.eu-west-2.aws.neon.tech/neondb/tillflow_preview'],
    // WS6 finding 2: Neon `options=endpoint=…` routing to the Production compute from a benign hostname
    [
      'Production endpoint smuggled through options=endpoint',
      'postgresql://u:p@ep-late-cell-1234.eu-west-2.aws.neon.tech/tillflow_preview?options=endpoint%3Dep-fancy-darkness-abyuvjxt',
    ],
    ['Production endpoint smuggled through options=endpoint (unencoded)', 'postgresql://u:p@localhost/tillflow_ci?options=endpoint=ep-fancy-darkness-abyuvjxt'],
    // WS6 re-review: a malformed `%zz` elsewhere must not disable decoding of the encoded endpoint id
    [
      'encoded Production endpoint beside a poisoned percent-escape',
      'postgresql://u:p@ep-late-cell-1.eu-west-2.aws.neon.tech/tillflow_preview?options=endpoint%3Dep-fancy%2Ddarkness-abyuvjxt&x=%zz',
    ],
    ['Production endpoint in the raw query with mixed case', 'postgresql://u:p@localhost/tillflow_ci?options=endpoint%3DEP-FANCY-DARKNESS-abyuvjxt'],
    // WS6 re-review: the isolated-endpoint rule is anchored on the first host label
    ['isolated fragment as an unrelated domain label', 'postgresql://u:p@late-cell.example.com/tillflow_ci'],
    ['isolated fragment as a sub-domain of a foreign host', 'postgresql://u:p@ep-late-cell-1.evil.example.com.attacker.net/tillflow_preview'],
    // WS6 finding 3: an isolated-looking database name on an UNKNOWN remote endpoint is not enough
    ['tillflow_preview on an unknown Neon endpoint', 'postgresql://u:p@ep-quiet-sea-1234.eu-west-2.aws.neon.tech/tillflow_preview'],
    ['tillflow_ci on an unknown remote host', 'postgresql://u:p@db.example.com:5432/tillflow_ci'],
    ['tillflow_qa on a new Neon compute id', 'postgresql://u:p@ep-brand-new-9999.eu-west-2.aws.neon.tech/tillflow_qa'],
  ])('refuses %s', (_label, url) => {
    const verdict = evaluateDatabaseTarget(url, env({}));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBeTruthy();
  });

  it('refuses everything when VERCEL_ENV=production, even an otherwise-allowed target', () => {
    expect(evaluateDatabaseTarget(CI, env({ VERCEL_ENV: 'production' })).ok).toBe(false);
  });

  it('refuses extra hosts named via TILLFLOW_PRODUCTION_DB_HOSTS', () => {
    const verdict = evaluateDatabaseTarget(
      'postgresql://u:p@ep-quiet-sea-1234.eu-west-2.aws.neon.tech/tillflow_preview',
      env({ TILLFLOW_PRODUCTION_DB_HOSTS: 'quiet-sea' }),
    );
    expect(verdict.ok).toBe(false);
  });

  it('a deny rule beats an allowlist entry', () => {
    const verdict = evaluateDatabaseTarget(PROD_POOLED, env({ [TEST_DATABASE_ALLOWLIST_KEY]: 'ep-fancy-darkness-abyuvjxt-pooler.eu-west-2.aws.neon.tech/neondb' }));
    expect(verdict.ok).toBe(false);
  });
});

describe('evaluateDatabaseTarget — approved isolated targets succeed', () => {
  it.each([
    ['CI service database', CI],
    ['isolated Preview branch database', PREVIEW],
    ['isolated Preview branch database (pooled)', PREVIEW_POOLED],
    ['sqlite unit database', SQLITE],
    ['local docker service host', 'postgresql://postgres:postgres@postgres:5432/anything'],
    ['the older isolated Preview branch (old-sunset)', 'postgresql://u:p@ep-old-sunset-1234.c-2.eu-west-2.aws.neon.tech/tillflow_preview'],
    ['uppercase host and database on a known isolated endpoint', 'postgresql://u:p@EP-LATE-CELL-1234.EU-WEST-2.AWS.NEON.TECH/TILLFLOW_PREVIEW'],
  ])('allows %s', (_label, url) => {
    expect(evaluateDatabaseTarget(url, env({})).ok).toBe(true);
  });

  it('a known isolated endpoint with a NON-isolated database name is still refused', () => {
    expect(evaluateDatabaseTarget('postgresql://u:p@ep-late-cell-1234.eu-west-2.aws.neon.tech/tillflow', env({})).ok).toBe(false);
    expect(evaluateDatabaseTarget('postgresql://u:p@ep-late-cell-1234.eu-west-2.aws.neon.tech/neondb', env({})).ok).toBe(false);
  });

  it('allows an explicitly allowlisted host/database pair (with or without the port)', () => {
    const url = 'postgresql://u:p@ep-quiet-sea-1234.eu-west-2.aws.neon.tech/tillflow';
    expect(evaluateDatabaseTarget(url, env({})).ok).toBe(false);
    expect(
      evaluateDatabaseTarget(url, env({ [TEST_DATABASE_ALLOWLIST_KEY]: 'ep-quiet-sea-1234.eu-west-2.aws.neon.tech/tillflow' })).ok,
    ).toBe(true);
    const withPort = 'postgresql://u:p@db.example.com:5432/tillflow_ci';
    expect(evaluateDatabaseTarget(withPort, env({ [TEST_DATABASE_ALLOWLIST_KEY]: 'db.example.com/tillflow_ci' })).ok).toBe(true);
    expect(evaluateDatabaseTarget(withPort, env({ [TEST_DATABASE_ALLOWLIST_KEY]: 'db.example.com:5432/tillflow_ci' })).ok).toBe(true);
  });
});

describe('resolveTestDatabaseTarget — conflicting variables cannot redirect Prisma', () => {
  it('reproduces the incident: DATABASE_URL=Preview with POSTGRES_PRISMA_URL=Production is refused as contradictory', () => {
    const e = env({ DATABASE_URL: PREVIEW, POSTGRES_PRISMA_URL: PROD_POOLED, POSTGRES_URL_NON_POOLING: PROD_DIRECT });
    expect(() => resolveTestDatabaseTarget(e, { requirePostgres: true })).toThrow(DatabaseTargetRefusedError);
    expect(() => resolveTestDatabaseTarget(e, { requirePostgres: true })).toThrow(/contradictory/);
    // and nothing was mutated
    expect(e.POSTGRES_PRISMA_URL).toBe(PROD_POOLED);
  });

  it('a sqlite DATABASE_URL beside a Production POSTGRES_PRISMA_URL is contradictory too', () => {
    const e = env({ DATABASE_URL: SQLITE, POSTGRES_PRISMA_URL: PROD_POOLED });
    expect(() => resolveTestDatabaseTarget(e)).toThrow(/contradictory/);
  });

  it('a Production DATABASE_URL is refused outright', () => {
    expect(() => resolveTestDatabaseTarget(env({ DATABASE_URL: PROD_DIRECT }))).toThrow(/Production/);
  });

  it('pooled and direct URLs for the same isolated database are not a contradiction', () => {
    const resolved = resolveTestDatabaseTarget(env({ DATABASE_URL: PREVIEW, POSTGRES_PRISMA_URL: PREVIEW_POOLED, POSTGRES_URL_NON_POOLING: PREVIEW }));
    expect(resolved.url).toBe(PREVIEW);
    expect(resolved.contradictions).toEqual([]);
  });

  it('the explicit override wins and is itself guarded', () => {
    const ok = resolveTestDatabaseTarget(env({ [TEST_DATABASE_OVERRIDE_KEY]: PREVIEW, DATABASE_URL: SQLITE, POSTGRES_PRISMA_URL: PROD_POOLED }));
    expect(ok.source).toBe('override');
    expect(ok.url).toBe(PREVIEW);
    expect(() => resolveTestDatabaseTarget(env({ [TEST_DATABASE_OVERRIDE_KEY]: PROD_POOLED, DATABASE_URL: PREVIEW }))).toThrow(/Production/);
  });

  it('requirePostgres refuses a sqlite target', () => {
    expect(() => resolveTestDatabaseTarget(env({ DATABASE_URL: SQLITE }), { requirePostgres: true })).toThrow(/Postgres test database is required/);
  });
});

describe('scripts/lib/guarded-prisma.cjs mirrors the TypeScript guard', () => {
  const require = createRequire(import.meta.url);
  const cjs = require('../scripts/lib/guarded-prisma.cjs') as {
    evaluateDatabaseTarget: (url: string, env: NodeJS.ProcessEnv) => { ok: boolean };
    isProductionTarget: (identity: unknown, env: NodeJS.ProcessEnv) => boolean;
    describeDatabaseUrl: (url: string) => { kind: string; database: string; sanitized: string; redactedUrl: string };
    openGuardedPrismaClient: (o: Record<string, unknown>) => Promise<unknown>;
    PRISMA_URL_ENV_KEYS: string[];
  };

  it.each([
    PROD_POOLED,
    PROD_DIRECT,
    'postgresql://u:p@ep-other-1234.eu-west-2.aws.neon.tech/neondb',
    'postgresql://u:p@db.example.com:5432/tillflow',
    'postgresql://u:p@ep-late-cell-1234.eu-west-2.aws.neon.tech/neondb/',
    'postgresql://u:p@ep-late-cell-1234.eu-west-2.aws.neon.tech/tillflow_preview?options=endpoint%3Dep-fancy-darkness-abyuvjxt',
    'postgresql://u:p@ep-quiet-sea-1234.eu-west-2.aws.neon.tech/tillflow_preview',
    'postgresql://u:p@ep-old-sunset-1234.c-2.eu-west-2.aws.neon.tech/tillflow_preview',
    'postgresql://u:p@ep-late-cell-1.eu-west-2.aws.neon.tech/tillflow_preview?options=endpoint%3Dep-fancy%2Ddarkness-abyuvjxt&x=%zz',
    'postgresql://u:p@late-cell.example.com/tillflow_ci',
    'postgresql://u:p@ep-late-cell-1.attacker.net/tillflow_preview',
    'postgresql://u:p@EP-LATE-CELL-1234.EU-WEST-2.AWS.NEON.TECH/TILLFLOW_PREVIEW',
    '',
    CI,
    PREVIEW,
    PREVIEW_POOLED,
    SQLITE,
  ])('agrees with the TypeScript verdict for %s', (url) => {
    expect(cjs.evaluateDatabaseTarget(url, env({})).ok).toBe(evaluateDatabaseTarget(url, env({})).ok);
  });

  it('agrees on a case-folded allowlist pair', () => {
    const url = 'postgresql://u:p@db.example.com:5432/TILLFLOW_QA';
    const e = env({ [TEST_DATABASE_ALLOWLIST_KEY]: 'DB.example.com/tillflow_qa' });
    expect(evaluateDatabaseTarget(url, e).ok).toBe(true);
    expect(cjs.evaluateDatabaseTarget(url, e).ok).toBe(true);
  });

  it('never keeps secret query parameters in the redacted URL either', () => {
    const id = cjs.describeDatabaseUrl('postgresql://u:p@localhost/tillflow_ci?sslpassword=pem-secret');
    expect(id.redactedUrl).not.toContain('pem-secret');
  });

  it('pins the same set of environment keys', () => {
    expect([...cjs.PRISMA_URL_ENV_KEYS].sort()).toEqual([...PRISMA_URL_ENV_KEYS].sort());
  });

  it('refuses to open Production for writes even when a client class is injected', async () => {
    const constructed: string[] = [];
    class FakeClient {
      constructor(opts: { datasources: { db: { url: string } } }) {
        constructed.push(opts.datasources.db.url);
      }
    }
    await expect(cjs.openGuardedPrismaClient({ url: PROD_DIRECT, env: {}, PrismaClient: FakeClient, log: () => undefined })).rejects.toThrow(/Production/);
    await expect(
      cjs.openGuardedPrismaClient({ url: PROD_DIRECT, readOnly: true, env: {}, PrismaClient: FakeClient, log: () => undefined }),
    ).rejects.toThrow(/TILLFLOW_ALLOW_PRODUCTION_READ/);
    expect(constructed).toEqual([]);
  });
});

describe('prepareTestDatabaseEnv / pinPrismaEnv', () => {
  it('pins every Prisma URL variable — including ones that pointed at Production — to the single guarded target', () => {
    const e = env({ [TEST_DATABASE_OVERRIDE_KEY]: PREVIEW, DATABASE_URL: SQLITE, POSTGRES_PRISMA_URL: PROD_POOLED, POSTGRES_URL_NON_POOLING: PROD_DIRECT });
    const prepared = prepareTestDatabaseEnv(e, { requirePostgres: true });
    for (const key of PRISMA_URL_ENV_KEYS) expect(e[key]).toBe(PREVIEW);
    expect(prepared.pinnedKeys).toContain('POSTGRES_PRISMA_URL');
    expect(prepared.pinnedKeys).toContain('DIRECT_URL');
    expect(() => assertPrismaEnvPinned(e, prepared.identity)).not.toThrow();
  });

  it('a refused target leaves the environment untouched', () => {
    const e = env({ DATABASE_URL: PROD_DIRECT, POSTGRES_PRISMA_URL: PROD_POOLED });
    expect(() => prepareTestDatabaseEnv(e)).toThrow(DatabaseTargetRefusedError);
    expect(e.DATABASE_URL).toBe(PROD_DIRECT);
    expect(e.POSTGRES_PRISMA_URL).toBe(PROD_POOLED);
    expect(e.DIRECT_URL).toBeUndefined();
  });

  it('assertPrismaEnvPinned catches a variable re-pointed after pinning', () => {
    const e = env({ DATABASE_URL: CI });
    const prepared = prepareTestDatabaseEnv(e, { requirePostgres: true });
    e.POSTGRES_PRISMA_URL = PROD_POOLED;
    expect(() => assertPrismaEnvPinned(e, prepared.identity)).toThrow(DatabaseTargetRefusedError);
  });

  it('pinPrismaEnv reports exactly the keys it changed', () => {
    const e = env({ DATABASE_URL: CI, POSTGRES_PRISMA_URL: CI });
    const changed = pinPrismaEnv(e, CI);
    expect(changed).not.toContain('DATABASE_URL');
    expect(changed).not.toContain('POSTGRES_PRISMA_URL');
    expect(changed).toContain('POSTGRES_URL_NON_POOLING');
  });
});
