/**
 * The ONE way a test may obtain a Prisma client.
 *
 * Every live-database suite must call {@link openTestPrismaClient}. It:
 *   1. resolves the single permitted target (fail-closed guard, contradiction check);
 *   2. pins every Prisma URL variable to that target, so `@/lib/prisma` and any nested
 *      `new PrismaClient()` inside the code under test cannot fall back to `.env`;
 *   3. drops any already-constructed `@/lib/prisma` singleton and resets modules;
 *   4. constructs the client with an EXPLICIT datasource (never the ambient env);
 *   5. connects and proves the server-side `current_database()` is the guarded database
 *      before returning — no test write can happen before that proof.
 *
 * `lib/reliability/database-test-safety.test.ts` fails the build if a test file constructs
 * `new PrismaClient(` directly instead of using this factory.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  assertPrismaEnvPinned,
  DatabaseTargetRefusedError,
  describeDatabaseUrl,
  formatGuardLine,
  prepareTestDatabaseEnv,
  type DatabaseIdentity,
  type PreparedTestDatabaseEnv,
} from '@/lib/database-target-guard';

export type GeneratedClientDatasource = {
  schemaPath: string;
  provider: 'postgresql' | 'sqlite' | 'unknown';
  urlEnv: string;
  directUrlEnv: string;
};

/** What the generated client at node_modules/.prisma/client will actually read. */
export function generatedClientDatasource(cwd = process.cwd()): GeneratedClientDatasource {
  const schemaPath = join(cwd, 'node_modules', '.prisma', 'client', 'schema.prisma');
  let contents = '';
  try {
    contents = readFileSync(schemaPath, 'utf8');
  } catch {
    return { schemaPath, provider: 'unknown', urlEnv: '', directUrlEnv: '' };
  }
  return {
    schemaPath,
    provider: /provider\s*=\s*"postgresql"/.test(contents)
      ? 'postgresql'
      : /provider\s*=\s*"sqlite"/.test(contents)
        ? 'sqlite'
        : 'unknown',
    urlEnv: /\burl\s*=\s*env\("([^"]+)"\)/.exec(contents)?.[1] ?? '',
    directUrlEnv: /directUrl\s*=\s*env\("([^"]+)"\)/.exec(contents)?.[1] ?? '',
  };
}

/**
 * True when a live Postgres suite may run. Refused targets THROW (loudly) rather than
 * returning false, so a Production URL can never be silently "skipped past".
 */
export function canRunLivePostgresTests(env: NodeJS.ProcessEnv = process.env): boolean {
  const prepared = prepareTestDatabaseEnv(env, { requirePostgres: false });
  return prepared.identity.kind === 'postgres';
}

export type TestPrismaHandle = {
  prisma: PrismaClient;
  url: string;
  identity: DatabaseIdentity;
  prepared: PreparedTestDatabaseEnv;
  generated: GeneratedClientDatasource;
  live: { currentDatabase: string; currentSchema: string };
};

export type OpenTestPrismaOptions = {
  env?: NodeJS.ProcessEnv;
  /** Injected for the guard's own regression tests; production callers never set this. */
  construct?: (url: string) => PrismaClient;
  /** Skip the live round-trip (regression tests only). */
  skipLiveVerification?: boolean;
  log?: (line: string) => void;
};

/**
 * Disconnect and forget the `@/lib/prisma` singleton so the next import re-evaluates against the
 * pinned env. Services imported by a suite BEFORE the factory ran keep a reference to the old
 * instance; that is safe because it was constructed under the same pinned vitest env (setupFiles
 * run first) and Prisma reconnects lazily on the next query — but suites should still prefer
 * importing services after `openTestPrismaClient()` resolves.
 */
async function dropAppPrismaSingleton() {
  const g = globalThis as unknown as { prisma?: PrismaClient };
  if (g.prisma) {
    await g.prisma.$disconnect().catch(() => undefined);
    g.prisma = undefined;
  }
  // vitest exposes `vi` globally (globals: true); resetting modules makes `@/lib/prisma`
  // re-evaluate against the pinned env on its next import.
  const maybeVi = (globalThis as unknown as { vi?: { resetModules?: () => void } }).vi;
  maybeVi?.resetModules?.();
}

/**
 * Guard → pin → construct (explicit datasource) → connect → prove identity → return.
 * Throws {@link DatabaseTargetRefusedError} before any client is constructed when refused.
 */
export async function openTestPrismaClient(options: OpenTestPrismaOptions = {}): Promise<TestPrismaHandle> {
  const env = options.env ?? process.env;
  const log = options.log ?? ((line: string) => console.info(line));

  const prepared = prepareTestDatabaseEnv(env, { requirePostgres: true });
  assertPrismaEnvPinned(env, prepared.identity);
  const generated = generatedClientDatasource();
  if (generated.provider === 'postgresql' && generated.urlEnv && env[generated.urlEnv] !== prepared.url) {
    throw new DatabaseTargetRefusedError(
      `generated client reads ${generated.urlEnv}, which is not pinned to the guarded target`,
      prepared.identity,
    );
  }
  log(formatGuardLine(prepared));

  if (env === process.env) await dropAppPrismaSingleton();

  const construct = options.construct ?? ((url: string) => new PrismaClient({ datasources: { db: { url } } }));
  const prisma = construct(prepared.url);

  let live = { currentDatabase: prepared.identity.database, currentSchema: prepared.identity.schema };
  if (!options.skipLiveVerification) {
    // Any failure between construction and the identity proof must release the client.
    try {
      await prisma.$connect();
      const [row] = await prisma.$queryRaw<Array<{ db: string; schema: string }>>`
        SELECT current_database() AS db, current_schema() AS schema
      `;
      live = { currentDatabase: row?.db ?? '', currentSchema: row?.schema ?? '' };
      const liveVerdict = describeDatabaseUrl(`postgresql://${prepared.identity.host}/${live.currentDatabase}`);
      if (live.currentDatabase !== prepared.identity.database || liveVerdict.database.toLowerCase() === 'neondb') {
        throw new DatabaseTargetRefusedError(
          `connected database "${live.currentDatabase}" does not match guarded target "${prepared.identity.database}"`,
          prepared.identity,
        );
      }
    } catch (error) {
      await prisma.$disconnect().catch(() => undefined);
      throw error;
    }
    log(`[database-target-guard] live current_database=${live.currentDatabase} schema=${live.currentSchema}`);
  }

  return { prisma, url: prepared.url, identity: prepared.identity, prepared, generated, live };
}

/**
 * Run every teardown step, never stopping early, then disconnect, then throw an aggregate
 * if anything failed. Teardown must not hide partial setup or cleanup failures: a failed
 * delete means rows were left behind and the suite must say so.
 */
export async function runTestTeardown(
  prisma: PrismaClient | undefined,
  steps: Array<() => Promise<unknown>>,
  options: { label?: string } = {},
): Promise<void> {
  const failures: Array<{ index: number; error: unknown }> = [];
  if (prisma) {
    for (const [index, step] of steps.entries()) {
      try {
        await step();
      } catch (error) {
        failures.push({ index, error });
      }
    }
    await prisma.$disconnect().catch((error: unknown) => failures.push({ index: -1, error }));
  }
  if (failures.length > 0) {
    const detail = failures
      .map((f) => `step ${f.index}: ${f.error instanceof Error ? f.error.message : String(f.error)}`)
      .join('\n');
    throw new Error(`[test-teardown${options.label ? ' ' + options.label : ''}] ${failures.length} step(s) failed — rows may remain:\n${detail}`);
  }
}
