import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { DatabaseTargetRefusedError, PRISMA_URL_ENV_KEYS, TEST_DATABASE_OVERRIDE_KEY } from '@/lib/database-target-guard';
import { generatedClientDatasource, openTestPrismaClient, runTestTeardown } from './test-prisma';
import { prepareVitestDatabaseEnv, UNIT_SQLITE_DEFAULT_URL } from './vitest-database-env';

const PROD_POOLED = 'postgresql://user:secret@ep-fancy-darkness-abyuvjxt-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require';
const PROD_DIRECT = 'postgresql://user:secret@ep-fancy-darkness-abyuvjxt.eu-west-2.aws.neon.tech/neondb?sslmode=require';
const PREVIEW = 'postgresql://user:secret@ep-late-cell-abcd1234.eu-west-2.aws.neon.tech/tillflow_preview?sslmode=require';
const CI = 'postgresql://postgres:postgres@localhost:5432/tillflow_ci?schema=public';
const envOf = (overrides: Record<string, string | undefined>): NodeJS.ProcessEnv => ({ ...overrides }) as unknown as NodeJS.ProcessEnv;

function fakeClient() {
  return { $connect: vi.fn(), $disconnect: vi.fn(async () => undefined), $queryRaw: vi.fn() } as unknown as PrismaClient;
}

describe('openTestPrismaClient — the guard runs before any client exists', () => {
  it('refuses a Production target without ever constructing a client', async () => {
    const construct = vi.fn(() => fakeClient());
    const env = envOf({ DATABASE_URL: PROD_DIRECT, POSTGRES_PRISMA_URL: PROD_POOLED });
    await expect(openTestPrismaClient({ env, construct, log: () => undefined })).rejects.toBeInstanceOf(DatabaseTargetRefusedError);
    expect(construct).not.toHaveBeenCalled();
  });

  it('refuses the incident shape (DATABASE_URL=Preview, POSTGRES_PRISMA_URL=Production) without constructing', async () => {
    const construct = vi.fn(() => fakeClient());
    const env = envOf({ DATABASE_URL: PREVIEW, POSTGRES_PRISMA_URL: PROD_POOLED, POSTGRES_URL_NON_POOLING: PROD_DIRECT });
    await expect(openTestPrismaClient({ env, construct, log: () => undefined })).rejects.toThrow(/contradictory/);
    expect(construct).not.toHaveBeenCalled();
    expect(env.POSTGRES_PRISMA_URL).toBe(PROD_POOLED);
  });

  it('constructs with an explicit datasource equal to the pinned target for an approved database', async () => {
    const construct = vi.fn(() => fakeClient());
    const env = envOf({ [TEST_DATABASE_OVERRIDE_KEY]: CI, DATABASE_URL: PREVIEW, POSTGRES_PRISMA_URL: PROD_POOLED });
    const lines: string[] = [];
    const handle = await openTestPrismaClient({ env, construct, skipLiveVerification: true, log: (l) => lines.push(l) });
    expect(construct).toHaveBeenCalledTimes(1);
    expect(construct).toHaveBeenCalledWith(CI);
    expect(handle.url).toBe(CI);
    for (const key of PRISMA_URL_ENV_KEYS) expect(env[key]).toBe(CI);
    expect(lines.join('\n')).toContain('[database-target-guard] OK');
    expect(lines.join('\n')).not.toContain('secret');
  });

  it('rejects and disconnects when the live database name differs from the guarded target', async () => {
    const client = fakeClient();
    (client.$queryRaw as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ db: 'neondb', schema: 'public' }]);
    const env = envOf({ DATABASE_URL: CI });
    await expect(openTestPrismaClient({ env, construct: () => client, log: () => undefined })).rejects.toThrow(/does not match guarded target/);
    expect(client.$disconnect).toHaveBeenCalled();
  });

  it('disconnects the constructed client when $connect itself fails (no leaked connections)', async () => {
    const client = fakeClient();
    (client.$connect as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ECONNREFUSED'));
    const env = envOf({ DATABASE_URL: CI });
    await expect(openTestPrismaClient({ env, construct: () => client, log: () => undefined })).rejects.toThrow(/ECONNREFUSED/);
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects when the identity query fails', async () => {
    const client = fakeClient();
    (client.$queryRaw as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('permission denied'));
    const env = envOf({ DATABASE_URL: CI });
    await expect(openTestPrismaClient({ env, construct: () => client, log: () => undefined })).rejects.toThrow(/permission denied/);
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('reports the generated client datasource so callers can prove which env key Prisma reads', () => {
    const generated = generatedClientDatasource();
    expect(['postgresql', 'sqlite', 'unknown']).toContain(generated.provider);
    if (generated.provider === 'postgresql') {
      expect(generated.urlEnv).toBe('POSTGRES_PRISMA_URL');
      expect(PRISMA_URL_ENV_KEYS as readonly string[]).toContain(generated.urlEnv);
    }
  });
});

describe('runTestTeardown — teardown cannot hide failures', () => {
  it('runs every step, disconnects, then throws an aggregate naming the failed steps', async () => {
    const client = fakeClient();
    const order: number[] = [];
    await expect(
      runTestTeardown(client, [
        async () => order.push(0),
        async () => {
          order.push(1);
          throw new Error('FK violation: tills still referenced');
        },
        async () => order.push(2),
      ]),
    ).rejects.toThrow(/1 step\(s\) failed[\s\S]*step 1: FK violation/);
    expect(order).toEqual([0, 1, 2]);
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when setup never produced a client (the setup failure itself is what fails the suite)', async () => {
    await expect(runTestTeardown(undefined, [async () => { throw new Error('never runs'); }])).resolves.toBeUndefined();
  });
});

describe('prepareVitestDatabaseEnv', () => {
  it('unit mode neutralises Production Postgres variables by pinning them to the SQLite target', () => {
    const env = envOf({ DATABASE_URL: 'file:./ci-unit.db', POSTGRES_PRISMA_URL: PROD_POOLED, POSTGRES_URL_NON_POOLING: PROD_DIRECT });
    const result = prepareVitestDatabaseEnv(env);
    expect(result.mode).toBe('unit');
    for (const key of PRISMA_URL_ENV_KEYS) expect(env[key]).toBe('file:./ci-unit.db');
  });

  it('unit mode with no DATABASE_URL falls back to the CI SQLite default', () => {
    const env = envOf({});
    expect(prepareVitestDatabaseEnv(env).url).toBe(UNIT_SQLITE_DEFAULT_URL);
    expect(env.POSTGRES_PRISMA_URL).toBe(UNIT_SQLITE_DEFAULT_URL);
  });

  it('unit mode still refuses a Production DATABASE_URL', () => {
    expect(() => prepareVitestDatabaseEnv(envOf({ DATABASE_URL: PROD_DIRECT }))).toThrow(DatabaseTargetRefusedError);
  });

  it('postgres mode is strict: contradictory variables are refused and nothing is pinned', () => {
    const env = envOf({ TILLFLOW_INCLUDE_PG_TESTS: '1', DATABASE_URL: PREVIEW, POSTGRES_PRISMA_URL: PROD_POOLED });
    expect(() => prepareVitestDatabaseEnv(env)).toThrow(/contradictory/);
    expect(env.POSTGRES_PRISMA_URL).toBe(PROD_POOLED);
  });

  it('postgres mode with the CI shape passes and pins', () => {
    const env = envOf({ TILLFLOW_INCLUDE_PG_TESTS: '1', DATABASE_URL: CI, POSTGRES_PRISMA_URL: CI, POSTGRES_URL_NON_POOLING: CI });
    const result = prepareVitestDatabaseEnv(env);
    expect(result.mode).toBe('postgres');
    expect(env.DIRECT_URL).toBe(CI);
  });
});

describe('this very process', () => {
  it('has every Prisma URL variable pinned to one guarded target before any test file ran', () => {
    const values = new Set(PRISMA_URL_ENV_KEYS.map((key) => process.env[key]));
    expect(values.size).toBe(1);
    const [only] = [...values];
    expect(only).toBeTruthy();
    expect(only).not.toMatch(/neondb|fancy-darkness/);
  });
});
