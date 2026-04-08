import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { tishgroupControlPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.tishgroupControlPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.tishgroupControlPrisma = prisma;
}