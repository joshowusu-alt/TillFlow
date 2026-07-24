import { PrismaClient } from '@prisma/client';
import { assertIsolatedPreviewDb } from './assert-preview-db.mjs';
import { spawnSync } from 'node:child_process';

const preview = assertIsolatedPreviewDb();
spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', 'generate', '--schema=prisma/schema.postgres.prisma'],
  { env: { ...process.env, ...preview }, shell: true, stdio: 'inherit' },
);

const prisma = new PrismaClient({
  datasources: { db: { url: preview.POSTGRES_URL_NON_POOLING } },
  transactionOptions: { maxWait: 60_000, timeout: 300_000 },
});

const t0 = Date.now();
try {
  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1`;
      await new Promise((r) => setTimeout(r, 8000));
      await tx.$queryRaw`SELECT 2`;
      return 'ok';
    },
    { maxWait: 60_000, timeout: 300_000 },
  );
  console.log('PASS waited 8s inside TX', Date.now() - t0);
} catch (e) {
  console.log('FAIL', e.message.split('\n')[0], 'elapsed', Date.now() - t0);
} finally {
  await prisma.$disconnect();
  spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['prisma', 'generate', '--schema=prisma/schema.prisma'],
    { env: process.env, shell: true, stdio: 'inherit' },
  );
}
