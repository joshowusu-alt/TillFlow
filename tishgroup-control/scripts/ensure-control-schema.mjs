import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';

for (const envFile of ['.env.production.local', '.env.local']) {
  if (!existsSync(envFile)) continue;
  const content = readFileSync(envFile, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, '');
  }
}

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ControlStaff"
      ADD COLUMN IF NOT EXISTS "passwordHash" TEXT,
      ADD COLUMN IF NOT EXISTS "passwordSetAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT,
      ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ControlAuditLog" (
      "id" TEXT NOT NULL,
      "staffId" TEXT,
      "staffEmail" TEXT NOT NULL,
      "staffRole" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "businessId" TEXT,
      "summary" TEXT NOT NULL,
      "metadata" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ControlAuditLog_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ControlAuditLog_businessId_createdAt_idx"
      ON "ControlAuditLog"("businessId", "createdAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ControlAuditLog_staffId_createdAt_idx"
      ON "ControlAuditLog"("staffId", "createdAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ControlAuditLog_action_createdAt_idx"
      ON "ControlAuditLog"("action", "createdAt");
  `);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('[ensure-control-schema] Failed to ensure control schema', error);
    await prisma.$disconnect();
    process.exit(1);
  });
