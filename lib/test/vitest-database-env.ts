/**
 * Vitest database-environment preparation. Runs in BOTH places, before any test code:
 *   - `vitest.global-setup.ts` (main process, once, prints the sanitised identity), and
 *   - `vitest.setup.ts` (inside every worker, before each test file evaluates).
 *
 * Two modes:
 *   - Postgres mode (`TILLFLOW_INCLUDE_PG_TESTS=1` or `TILLFLOW_REQUIRE_ISOLATED_PREVIEW=1`):
 *     strict. The target must be an allowlisted Postgres database, every Prisma URL variable
 *     must agree (or `TILLFLOW_TEST_DATABASE_URL` must be set explicitly), and everything is
 *     pinned to it. Refusal throws before a single test file loads.
 *   - Unit mode (default): the target is the SQLite `DATABASE_URL` (or the CI default). Every
 *     Postgres URL variable is overwritten with that SQLite URL, so a Postgres-generated client
 *     that is accidentally left unmocked fails to connect instead of reaching `.env`'s Production
 *     URL. A Postgres `DATABASE_URL` in unit mode is still guarded (denied targets throw).
 */
import {
  describeDatabaseUrl,
  evaluateDatabaseTarget,
  DatabaseTargetRefusedError,
  formatGuardLine,
  pinPrismaEnv,
  prepareTestDatabaseEnv,
  TEST_DATABASE_OVERRIDE_KEY,
  type PreparedTestDatabaseEnv,
} from '@/lib/database-target-guard';

export const UNIT_SQLITE_DEFAULT_URL = 'file:./ci-unit.db';

export function vitestIncludesPostgresSuites(env: NodeJS.ProcessEnv = process.env) {
  return env.TILLFLOW_INCLUDE_PG_TESTS === '1' || env.TILLFLOW_REQUIRE_ISOLATED_PREVIEW === '1';
}

export type VitestDatabaseEnvResult = PreparedTestDatabaseEnv & { mode: 'postgres' | 'unit' };

export function prepareVitestDatabaseEnv(env: NodeJS.ProcessEnv = process.env): VitestDatabaseEnvResult {
  if (vitestIncludesPostgresSuites(env)) {
    return { ...prepareTestDatabaseEnv(env, { requirePostgres: true }), mode: 'postgres' };
  }

  const override = env[TEST_DATABASE_OVERRIDE_KEY]?.trim();
  const candidate = override || env.DATABASE_URL?.trim() || UNIT_SQLITE_DEFAULT_URL;
  const identity = describeDatabaseUrl(candidate);
  if (identity.kind === 'postgres') {
    // Someone ran the unit suite against Postgres on purpose: apply the strict guard.
    return { ...prepareTestDatabaseEnv(env, { requirePostgres: true }), mode: 'unit' };
  }
  const verdict = evaluateDatabaseTarget(candidate, env);
  if (!verdict.ok) throw new DatabaseTargetRefusedError(verdict.reason, identity);
  const pinnedKeys = pinPrismaEnv(env, candidate);
  return {
    url: candidate,
    identity,
    source: override ? 'override' : 'DATABASE_URL',
    verdict,
    contradictions: [],
    pinnedKeys,
    mode: 'unit',
  };
}

export function formatVitestGuardLine(result: VitestDatabaseEnvResult) {
  return `${formatGuardLine(result)} mode=${result.mode}`;
}
