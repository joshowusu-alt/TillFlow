/**
 * Read-only status check for smoke/assessment businesses in production DB.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] ??= v.replace(/\\n$/, '');
    }
  } catch {
    // optional file
  }
}

loadEnv('.env.production.local');
const pg =
  process.env.POSTGRES_URL_NON_POOLING?.replace(/\\n/g, '').trim() ||
  process.env.POSTGRES_PRISMA_URL?.replace(/\\n/g, '').trim();
if (pg) {
  process.env.POSTGRES_PRISMA_URL = pg;
  process.env.DATABASE_URL = pg;
}

const prisma = new PrismaClient();

const businesses = await prisma.business.findMany({
  where: {
    OR: [
      { name: { startsWith: 'Smoke ' } },
      { name: { startsWith: 'Assess ' } },
    ],
  },
  orderBy: { createdAt: 'asc' },
  select: {
    id: true,
    name: true,
    plan: true,
    planStatus: true,
    subscriptionStatus: true,
    billingInterval: true,
    addonOnlineStorefront: true,
    billingAmount: true,
    storefrontEnabled: true,
    cancelledAt: true,
    createdAt: true,
  },
});

console.log(JSON.stringify(businesses.map((b) => ({
  ...b,
  createdAt: b.createdAt.toISOString().slice(0, 10),
  cancelledAt: b.cancelledAt ? b.cancelledAt.toISOString().slice(0, 10) : null,
})), null, 2));
await prisma.$disconnect();
