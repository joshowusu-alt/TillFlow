/**
 * Thin compatibility layer over the central test-client factory (`@/lib/test/test-prisma`)
 * and the fail-closed target guard (`@/lib/database-target-guard`).
 *
 * Historical note: this module used to prefer `POSTGRES_URL_NON_POOLING` / `POSTGRES_PRISMA_URL`
 * over `DATABASE_URL` and constructed clients synchronously without verifying the live
 * database. Both behaviours are gone: the single permitted target is resolved by the guard
 * (`TILLFLOW_TEST_DATABASE_URL`, else a non-contradictory `DATABASE_URL`), and clients are
 * only handed out after the server-side identity has been proven.
 */
import type { PrismaClient } from '@prisma/client';
import {
  DatabaseTargetRefusedError,
  describeDatabaseUrl,
  evaluateDatabaseTarget,
  pinPrismaEnv,
  prepareTestDatabaseEnv,
  sameDatabaseTarget,
} from '@/lib/database-target-guard';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';
import { openTestPrismaClient } from '@/lib/test/test-prisma';

export type PostgresUrlIdentity = {
  hostPrefix: string;
  database: string;
  schema: string;
};

/**
 * The one URL every Prisma client in this process may use. Refused or contradictory
 * targets throw (loudly, at import time of the calling suite). In the SQLite unit run
 * this returns the pinned SQLite URL and {@link canRunLivePostgres} is false.
 */
export function resolveBoundPostgresUrl(): string {
  return prepareTestDatabaseEnv(process.env, { requirePostgres: false }).url;
}

export function postgresUrlIdentity(url: string): PostgresUrlIdentity {
  const parsed = new URL(url);
  return {
    hostPrefix: parsed.hostname.split('.')[0],
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '').split('?')[0] || ''),
    schema: parsed.searchParams.get('schema') || 'public',
  };
}

export function canRunLivePostgres(url = resolveBoundPostgresUrl()): boolean {
  return isPostgresDatabaseUrl(url);
}

/**
 * Optional stricter constraint used by the Preview walkthrough proofs: when
 * `TILLFLOW_REQUIRE_ISOLATED_PREVIEW=1`, only the dedicated `tillflow_preview` database on
 * the isolated Neon branch is accepted. The general guard still applies first.
 */
export function assertIsolatedPreviewHost(url: string): PostgresUrlIdentity {
  const verdict = evaluateDatabaseTarget(url, process.env);
  if (!verdict.ok) throw new DatabaseTargetRefusedError(verdict.reason, verdict.identity);
  const identity = postgresUrlIdentity(url);
  if (process.env.TILLFLOW_REQUIRE_ISOLATED_PREVIEW === '1') {
    if (!/old-sunset|late-cell/i.test(identity.hostPrefix) || identity.database !== 'tillflow_preview') {
      throw new Error(
        `Refusing non-isolated Postgres hostPrefix=${identity.hostPrefix} database=${identity.database}`,
      );
    }
  }
  return identity;
}

/**
 * Pin every Prisma URL variable to `url` (after guarding it). Kept for suites that re-pin
 * between `vi.resetModules()` calls; it can never widen the target.
 */
export function bindPrismaPostgresUrls(url: string): PostgresUrlIdentity {
  const identity = assertIsolatedPreviewHost(url);
  const guarded = prepareTestDatabaseEnv(process.env, { requirePostgres: true });
  if (!sameDatabaseTarget(describeDatabaseUrl(url), guarded.identity)) {
    throw new DatabaseTargetRefusedError(
      `bindPrismaPostgresUrls(${describeDatabaseUrl(url).sanitized}) differs from the guarded target ${guarded.identity.sanitized}`,
      guarded.identity,
    );
  }
  pinPrismaEnv(process.env, url);
  return identity;
}

/**
 * Open a connected, identity-verified client for `url` via the central factory.
 * `url` must be the guarded target (it is only accepted as a cross-check).
 */
export async function openBoundPrismaClient(url: string): Promise<PrismaClient> {
  bindPrismaPostgresUrls(url);
  const handle = await openTestPrismaClient();
  if (handle.url !== url) {
    await handle.prisma.$disconnect().catch(() => undefined);
    throw new DatabaseTargetRefusedError('factory target differs from the requested url', handle.identity);
  }
  return handle.prisma;
}

export async function proveWalkthroughPostgresSchema(prisma: PrismaClient) {
  const [dbRow] = await prisma.$queryRaw<Array<{ db: string; schema: string }>>`
    SELECT current_database() AS db, current_schema() AS schema
  `;
  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StockAdjustment'
      AND column_name = 'transactionNumber'
  `;
  const migrations = await prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name
    FROM "_prisma_migrations"
    WHERE migration_name IN (
      '20260917180000_owner_walkthrough_integrity',
      '20260918140000_walkthrough_store_numbers',
      '20260918230000_shift_presentation_numbers'
    )
    ORDER BY migration_name
  `;
  return {
    currentDatabase: dbRow?.db ?? '',
    currentSchema: dbRow?.schema ?? '',
    hasTransactionNumber: columns.length === 1,
    appliedWalkthroughMigrations: migrations.map((row) => row.migration_name),
  };
}
