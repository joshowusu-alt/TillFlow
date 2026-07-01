/**
 * Discover QA/demo tenants and users in production DB. No secrets printed.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

function loadEnv(path) {
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.replace(/\r/g, '');
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    v = v.replace(/\\n$/, '').replace(/\r/g, '');
    process.env[m[1]] ??= v;
  }
}

loadEnv('.env.production.local');
const pg =
  process.env.POSTGRES_URL_NON_POOLING?.replace(/\\n/g, '').trim() ||
  process.env.POSTGRES_PRISMA_URL?.replace(/\\n/g, '').trim();
if (!pg || pg.startsWith('file:')) {
  console.log(JSON.stringify({ error: 'Production Postgres URL missing in .env.production.local' }));
  process.exit(1);
}
process.env.POSTGRES_PRISMA_URL = pg;
process.env.POSTGRES_URL_NON_POOLING = pg;
process.env.DATABASE_URL = pg;

const prisma = new PrismaClient();
const targetEmails = [
  'qa-owner@tillflow.app',
  'qa-cashier@tillflow.app',
  'qa-manager@tillflow.app',
  'adomtestmart.rehearsal.20260603@tillflow-test.invalid',
];

try {
  const users = await prisma.user.findMany({
    where: { email: { in: targetEmails } },
    select: {
      email: true,
      role: true,
      active: true,
      business: { select: { id: true, name: true } },
    },
  });

  const qaBusinesses = await prisma.business.findMany({
    where: {
      OR: [
        { name: { contains: 'QA', mode: 'insensitive' } },
        { name: { contains: 'Demo', mode: 'insensitive' } },
        { name: { contains: 'Adom Test', mode: 'insensitive' } },
        { name: { contains: 'Signoff', mode: 'insensitive' } },
        { name: { contains: 'Rehearsal', mode: 'insensitive' } },
      ],
    },
    take: 20,
    select: { id: true, name: true },
    orderBy: { createdAt: 'desc' },
  });

  console.log(
    JSON.stringify(
      {
        users,
        missingTargetEmails: targetEmails.filter(
          (email) => !users.some((user) => user.email === email),
        ),
        qaBusinesses,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.log(JSON.stringify({ error: String(error.message) }));
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
