import { PrismaClient } from '@prisma/client';
import { isSqliteRuntimeEnv } from '@/lib/database-runtime';
const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined };

const prismaClientSingleton = () => {
  return new PrismaClient({
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
