import { PrismaClient } from '@prisma/client';
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
if (process.env.DATABASE_URL?.includes('.db') || process.env.DATABASE_URL?.startsWith('file:')) {
  prisma.$connect().then(() =>
    prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON').catch(() => {})
  );
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
