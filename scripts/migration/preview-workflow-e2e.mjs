/**
 * Full catalogue → suppliers → opening-stock migration workflow on tillflow_preview_qa.
 * Synthetic data only. Includes retry + concurrent product-list reads for scale size.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { assertIsolatedPreviewDb } from './assert-preview-db.mjs';

const preview = assertIsolatedPreviewDb();
const PRODUCT_COUNT = Number(process.argv.find((a) => a.startsWith('--products='))?.split('=')[1] || 2500);
const CHUNK = Number(process.argv.find((a) => a.startsWith('--chunk='))?.split('=')[1] || 10);

const env = {
  ...process.env,
  ...preview,
  DATABASE_URL: preview.POSTGRES_URL_NON_POOLING,
  POSTGRES_PRISMA_URL: preview.POSTGRES_PRISMA_URL,
  POSTGRES_URL_NON_POOLING: preview.POSTGRES_URL_NON_POOLING,
  MIGRATION_E2E_PRODUCTS: String(PRODUCT_COUNT),
  MIGRATION_E2E_CHUNK: String(CHUNK),
};

console.log('Generating Postgres client...');
let r = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', 'generate', '--schema=prisma/schema.postgres.prisma'],
  { env, shell: true, stdio: 'inherit' },
);
if (r.status !== 0) process.exit(r.status ?? 1);

console.log(`Running workflow with ${PRODUCT_COUNT} products...`);
r = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsx', 'scripts/migration/preview-workflow-e2e-worker.ts'],
  { env, shell: true, stdio: 'inherit' },
);

console.log('Restoring SQLite Prisma client...');
spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', 'generate', '--schema=prisma/schema.prisma'],
  { env: process.env, shell: true, stdio: 'inherit' },
);

process.exit(r.status ?? 1);
