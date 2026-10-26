import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';

for (const envFile of ['.env.production.local', '.env.local', '.env']) {
  if (!existsSync(envFile)) continue;
  const content = readFileSync(envFile, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, '');
  }
}

const skipUnlessProduction =
  process.argv.includes('--if-production')
  && process.env.VERCEL_ENV !== 'production'
  && process.env.CONTROL_ENFORCE_AUTH_CUTOVER !== '1';

if (skipUnlessProduction) {
  console.log('auth-cutover-preflight skipped (not a production cutover)');
  process.exit(0);
}

const connectionUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!connectionUrl) {
  console.error('auth-cutover-preflight: set POSTGRES_URL_NON_POOLING or DATABASE_URL');
  process.exit(1);
}

const isProductionBlocker =
  process.env.VERCEL_ENV === 'production' || process.env.CONTROL_ENFORCE_AUTH_CUTOVER === '1';

const prisma = new PrismaClient({
  datasources: { db: { url: connectionUrl } },
});

async function main() {
  const rows = await prisma.$queryRaw`
    SELECT role, COUNT(*)::int AS count
    FROM "ControlStaff"
    WHERE active = true AND "passwordHash" IS NULL
    GROUP BY role
    ORDER BY role
  `;

  const counts = Array.isArray(rows) ? rows : [];
  let total = 0;

  console.log('auth-cutover-preflight');
  console.log('Active staff with passwordHash IS NULL, by role:');
  if (counts.length === 0) {
    console.log('  (none)');
  } else {
    for (const row of counts) {
      const role = typeof row.role === 'string' ? row.role : 'UNKNOWN';
      const count = Number(row.count) || 0;
      total += count;
      console.log(`  ${role}: ${count}`);
    }
  }
  console.log(`Total: ${total}`);

  if (total > 0) {
    if (isProductionBlocker) {
      console.error('RESULT: FAIL — production blocker (VERCEL_ENV=production or CONTROL_ENFORCE_AUTH_CUTOVER=1)');
    } else {
      console.error('RESULT: FAIL — active staff still lack a personal password');
    }
    process.exitCode = 1;
    return;
  }

  console.log('RESULT: PASS');
}

main()
  .catch(async (error) => {
    console.error('auth-cutover-preflight: query failed');
    console.error(error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
