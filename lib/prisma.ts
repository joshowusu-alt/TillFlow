import { PrismaClient } from '@prisma/client';
import { isSqliteRuntimeEnv } from '@/lib/database-runtime';
import { DatabaseTargetRefusedError, evaluateDatabaseTarget } from '@/lib/database-target-guard';
const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined };

/**
 * Under vitest the singleton is never allowed to resolve its datasource from the ambient
 * environment (which the Prisma runtime tops up from the repo `.env`, i.e. Production).
 * The test setup pins every Prisma URL variable to one guarded target; this re-checks that
 * target and passes it explicitly, failing closed if anything is missing or refused.
 * Outside vitest this is a no-op and the client is constructed exactly as before.
 */
function testDatasourceOverride(): { db: { url: string } } | undefined {
  if (!process.env.VITEST) return undefined;
  const url = process.env.POSTGRES_PRISMA_URL?.trim() || process.env.DATABASE_URL?.trim() || '';
  const verdict = evaluateDatabaseTarget(url, process.env);
  if (!verdict.ok) {
    throw new DatabaseTargetRefusedError(`@/lib/prisma under vitest: ${verdict.reason}`, verdict.identity);
  }
  return { db: { url } };
}

const prismaClientSingleton = () => {
  const datasources = testDatasourceOverride();
  return new PrismaClient({
    ...(datasources ? { datasources } : {}),
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
    // No global transactionOptions.timeout — the 8 s default was killing
    // large import operations. Per-call options are set where needed.
  });
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

// Enable SQLite foreign key enforcement (off by default in SQLite)
if (isSqliteRuntimeEnv(process.env)) {
  prisma.$connect().then(() =>
    prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON').catch((error) => {
      console.error('[prisma] Failed to enable SQLite foreign_keys pragma', { error });
    })
  );
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
