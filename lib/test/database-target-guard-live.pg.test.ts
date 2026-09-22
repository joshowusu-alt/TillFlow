/**
 * Live proof, isolated Postgres only: the factory's client AND the `@/lib/prisma` singleton
 * both talk to the guarded database, and the server-side identity matches the guard's.
 * Skipped in the SQLite unit run.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PRISMA_URL_ENV_KEYS, PRODUCTION_DATABASE_NAMES } from '@/lib/database-target-guard';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown, type TestPrismaHandle } from '@/lib/test/test-prisma';

const canRun = canRunLivePostgresTests();
const describePg = canRun ? describe : describe.skip;

describePg('database-target guard — live identity (Postgres)', () => {
  let handle: TestPrismaHandle;
  let prisma: PrismaClient;

  beforeAll(async () => {
    handle = await openTestPrismaClient();
    prisma = handle.prisma;
  }, 60000);

  afterAll(async () => {
    await runTestTeardown(prisma, [], { label: 'database-target-guard-live' });
  });

  it('prints a sanitised identity and connects to the guarded database', async () => {
    expect(handle.identity.kind).toBe('postgres');
    expect(PRODUCTION_DATABASE_NAMES).not.toContain(handle.live.currentDatabase);
    expect(handle.live.currentDatabase).toBe(handle.identity.database);
    expect(handle.identity.sanitized).not.toMatch(/:[^/@]+@/); // no `user:password@`
    console.info('DATABASE_TARGET_GUARD_LIVE', {
      target: handle.identity.sanitized,
      source: handle.prepared.source,
      currentDatabase: handle.live.currentDatabase,
      currentSchema: handle.live.currentSchema,
      generatedProvider: handle.generated.provider,
      generatedUrlEnv: handle.generated.urlEnv,
      pinnedKeys: handle.prepared.pinnedKeys,
    });
  });

  it('every Prisma URL variable is pinned to the same target the client is using', () => {
    for (const key of PRISMA_URL_ENV_KEYS) expect(process.env[key]).toBe(handle.url);
    if (handle.generated.provider === 'postgresql') {
      expect(process.env[handle.generated.urlEnv]).toBe(handle.url);
    }
  });

  it('the @/lib/prisma singleton resolves to the same guarded database (not .env)', async () => {
    const mod = await import('@/lib/prisma');
    const [row] = await mod.prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
    expect(row.db).toBe(handle.identity.database);
    expect(PRODUCTION_DATABASE_NAMES).not.toContain(row.db);
    await mod.prisma.$disconnect();
  });
});
