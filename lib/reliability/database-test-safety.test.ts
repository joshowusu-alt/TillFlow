/**
 * Repository gate: no test, seed, fixture or write-capable script may construct an
 * unguarded Prisma client. Runs in the unit job on every SHA.
 *
 * Rules
 *  1. Test files (`*.test.ts[x]`, `*.spec.ts`) never call `new PrismaClient(` and never import
 *     `PrismaClient` as a value from `@prisma/client`. They obtain clients from
 *     `@/lib/test/test-prisma` (`openTestPrismaClient`) or the compatibility wrapper
 *     `openBoundPrismaClient`.
 *  2. Test files never assign Prisma URL environment variables themselves (that bypasses the
 *     guard's contradiction check); only the guard/factory modules may.
 *  3. Write-capable scripts under `scripts/` and `prisma/` that construct a bare client are
 *     frozen to the baseline below. Adding a new one fails this test — route new scripts
 *     through `scripts/lib/guarded-prisma.cjs`.
 *  4. The wiring that makes the guard run first must stay in place.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'tmp', 'tishgroup-control', 'coverage', 'playwright-report', 'test-results']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = (file: string) => relative(root, file).replace(/\\/g, '/');
const read = (file: string) => readFileSync(file, 'utf8');

const allFiles = walk(root);
const SELF = 'lib/reliability/database-test-safety.test.ts';
const testFiles = allFiles.filter((f) => /\.(test|spec)\.tsx?$/.test(f) && rel(f) !== SELF);
const scriptFiles = allFiles.filter((f) => /^(scripts|prisma)\//.test(rel(f)) && /\.(ts|tsx|js|cjs|mjs)$/.test(f) && !/\.(test|spec)\./.test(f));

const BARE_CLIENT = /new PrismaClient\s*\(/;
const VALUE_IMPORT_PRISMA_CLIENT = /import\s*\{[^}]*\bPrismaClient\b[^}]*\}\s*from\s*['"]@prisma\/client['"]/;
const ENV_ASSIGNMENT = /process\.env\.(DATABASE_URL|DIRECT_URL|POSTGRES_PRISMA_URL|POSTGRES_URL|POSTGRES_URL_NON_POOLING|POSTGRES_URL_NO_SSL|PRISMA_DATABASE_URL|[A-Z0-9_]+_DATABASE_URL)\s*=[^=]/;

/** Test files that legitimately assign DB env vars to exercise SQL-dialect branches with a MOCKED prisma. */
const ENV_ASSIGNMENT_ALLOWLIST = new Set([
  'lib/services/checkout-shift-cashdrawer-rtx.test.ts',
  'lib/services/inventory-decrease.test.ts',
  'lib/services/inventory-increase.test.ts',
  'lib/services/inventory-increase-scoped-gate.test.ts',
  'lib/services/inventory-reversal.test.ts',
  'lib/services/sales.test.ts',
  'lib/services/shift-integrity.test.ts',
]);

/**
 * Frozen baseline of pre-existing scripts that construct a bare `new PrismaClient()`.
 * Every entry is a known, reviewed operator tool. Do NOT add to this list: new scripts must
 * use `scripts/lib/guarded-prisma.cjs`. Removing entries (as scripts are migrated) is welcome.
 */
const BARE_CLIENT_SCRIPT_BASELINE = new Set([
  'prisma/seed.ts',
  'scripts/backfill-control-plane.ts',
  'scripts/billing-smoke-control.mjs',
  'scripts/billing-smoke-verify.mjs',
  'scripts/check-smoke-business-status.mjs',
  'scripts/critical-path-smoke.js',
  'scripts/discover-qa-tenant.mjs',
  'scripts/gate-e-stamp-fixture.cjs',
  'scripts/manual-e2e-check.js',
  'scripts/manual-e2e-deep-check.js',
  'scripts/mobile-responsiveness-audit.js',
  'scripts/page-speed-check.js',
  'scripts/perf/catalogue-scale-bench.ts',
  'scripts/perf/pos-catalogue-scale-bench.ts',
  'scripts/phase3a-qa.ts',
  'scripts/phase3b-qa.ts',
  'scripts/rehearsal-check-business.mjs',
  'scripts/rehearsal-product-stock.mjs',
  'scripts/signoff-check.mjs',
  'scripts/signoff-control-http.mjs',
  'scripts/ui-programme-gate-e-orchestrate.cjs',
  'scripts/verify-control-copy-and-cleanup.mjs',
  // explicit-datasource scripts (still bare in the sense of no guard): frozen as well
  'scripts/assess-supplier-payment-orphans.ts',
  'scripts/perf/catalogue-scale-preview-pg.ts',
  'scripts/seed-adom-retail-demo-runner.ts',
  'scripts/test-backup.ts',
]);

describe('database test safety — no unguarded Prisma clients', () => {
  it('finds the test corpus', () => {
    expect(testFiles.length).toBeGreaterThan(50);
  });

  it('no test file constructs `new PrismaClient(` directly', () => {
    const offenders = testFiles.filter((f) => BARE_CLIENT.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('no test file imports PrismaClient as a value (type-only imports are fine)', () => {
    const offenders = testFiles.filter((f) => VALUE_IMPORT_PRISMA_CLIENT.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('every live-database test obtains its client from the central factory', () => {
    const live = testFiles.filter((f) => {
      const src = read(f);
      return /\$connect\(\)|openTestPrismaClient|openBoundPrismaClient|prisma\.\w+\.create\(/.test(src) && !/vi\.mock\(['"]@\/lib\/prisma['"]/.test(src) && /@prisma\/client|test-prisma|isolated-postgres/.test(src);
    });
    const offenders = live
      .filter((f) => !/openTestPrismaClient\(|openBoundPrismaClient\(/.test(read(f)))
      .map(rel)
      // the factory's own unit test uses injected fakes
      .filter((r) => r !== 'lib/test/test-prisma.test.ts');
    expect(offenders).toEqual([]);
    expect(live.length).toBeGreaterThanOrEqual(18);
  });

  it('no test file assigns Prisma URL environment variables (the guard owns pinning)', () => {
    const offenders = testFiles
      .filter((f) => !ENV_ASSIGNMENT_ALLOWLIST.has(rel(f)))
      .filter((f) => ENV_ASSIGNMENT.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('write-capable scripts with a bare client are frozen to the reviewed baseline', () => {
    const bare = scriptFiles.filter((f) => BARE_CLIENT.test(read(f))).map(rel);
    const newOffenders = bare.filter((r) => !BARE_CLIENT_SCRIPT_BASELINE.has(r) && r !== 'scripts/lib/guarded-prisma.cjs');
    expect(newOffenders).toEqual([]);
    // Baseline entries that disappeared should be removed from the list (keeps it honest).
    const stale = [...BARE_CLIENT_SCRIPT_BASELINE].filter((r) => !allFiles.some((f) => rel(f) === r));
    expect(stale).toEqual([]);
  });

  it('the compatibility helper no longer exposes a synchronous unverified client constructor', () => {
    const src = read(join(root, 'lib/test/isolated-postgres.ts'));
    expect(src).not.toContain('createBoundPrismaClient');
    expect(src).toContain('openTestPrismaClient');
    expect(src).not.toMatch(/POSTGRES_URL_NON_POOLING\?\.trim\(\) \|\|/); // old precedence is gone
  });

  it('guard wiring is in place: globalSetup, setupFiles and the app singleton', () => {
    const config = read(join(root, 'vitest.config.ts'));
    expect(config).toContain("globalSetup: ['./vitest.global-setup.ts']");
    expect(config).toContain("setupFiles: ['./vitest.setup.ts']");
    const setup = read(join(root, 'vitest.setup.ts'));
    expect(setup).toContain('prepareVitestDatabaseEnv(process.env)');
    const globalSetup = read(join(root, 'vitest.global-setup.ts'));
    expect(globalSetup).toContain('prepareVitestDatabaseEnv(process.env)');
    const singleton = read(join(root, 'lib/prisma.ts'));
    expect(singleton).toContain('testDatasourceOverride()');
    expect(singleton).toContain('evaluateDatabaseTarget(url, process.env)');
    const factory = read(join(root, 'lib/test/test-prisma.ts'));
    expect(factory).toContain('prepareTestDatabaseEnv(env, { requirePostgres: true })');
    expect(factory).toContain('SELECT current_database()');
  });

  it('the postgres CI job runs the live guard proof before any other database suite', () => {
    const wf = read(join(root, '.github/workflows/postgres-smoke.yml'));
    const guardIdx = wf.indexOf('lib/test/database-target-guard-live.pg.test.ts');
    const firstSuiteIdx = wf.indexOf('scripts/migration-p1-schema-pg-test.cjs', wf.indexOf('steps:'));
    expect(guardIdx).toBeGreaterThan(0);
    expect(guardIdx).toBeLessThan(firstSuiteIdx);
  });
});
