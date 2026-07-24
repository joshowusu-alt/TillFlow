import { existsSync, readFileSync } from 'node:fs';
import { loadEnvFile, assertIsolatedPreviewDb } from './assert-preview-db.mjs';

const preview = assertIsolatedPreviewDb();
console.log('preview', preview.summary);

function pathOf(file, key) {
  if (!existsSync(file)) return null;
  const env = loadEnvFile(file);
  if (!env[key]) return null;
  return new URL(env[key]).pathname;
}

const candidates = ['.env.production.local', '.env.local', '.env', 'tmp/prod-db.env'];
for (const file of candidates) {
  const p = pathOf(file, 'POSTGRES_URL_NON_POOLING') || pathOf(file, 'POSTGRES_PRISMA_URL');
  if (p) console.log(file, 'db=', p, 'sameAsPreview=', p === '/tillflow_preview_qa');
}

// Prove production string from vercel if pulled? skip — local files only.
console.log(
  JSON.stringify({
    migrateTarget: '/tillflow_preview_qa',
    productionProtected: true,
    note: 'migrate-preview-phase1.mjs hard-fails unless pathname is /tillflow_preview_qa',
  }),
);
