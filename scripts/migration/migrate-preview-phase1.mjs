/**
 * Apply pending Prisma migrations to isolated tillflow_preview_qa ONLY.
 * Refuses production / neondb connection strings.
 */
import { spawnSync } from 'node:child_process';
import { assertIsolatedPreviewDb } from './assert-preview-db.mjs';

const preview = assertIsolatedPreviewDb();
console.log('Migrating isolated Preview DB only:', preview.summary);

const env = {
  ...process.env,
  ...preview,
  DATABASE_URL: preview.POSTGRES_URL_NON_POOLING,
  POSTGRES_PRISMA_URL: preview.POSTGRES_PRISMA_URL,
  POSTGRES_URL_NON_POOLING: preview.POSTGRES_URL_NON_POOLING,
  // Prevent accidental sqlite fallback
  PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1',
};

const gen = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', 'generate', '--schema=prisma/schema.postgres.prisma'],
  { env, encoding: 'utf8', shell: true, stdio: 'inherit' },
);
if (gen.status !== 0) process.exit(gen.status ?? 1);

const migrate = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', 'migrate', 'deploy', '--schema=prisma/schema.postgres.prisma'],
  { env, encoding: 'utf8', shell: true, stdio: 'inherit' },
);
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

console.log('Preview migrate deploy finished successfully.');
