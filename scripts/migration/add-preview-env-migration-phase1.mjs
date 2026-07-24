/**
 * Attach isolated tillflow_preview_qa Preview env to migration-framework-phase1.
 * Does not touch Production.
 */
import { spawnSync } from 'node:child_process';
import { assertIsolatedPreviewDb, loadEnvFile } from './assert-preview-db.mjs';

const BRANCH = 'migration-framework-phase1';
const preview = assertIsolatedPreviewDb();
const legacy = loadEnvFile('tmp/preview-db.env');

console.log('Isolation OK:', preview.summary);

function addEnv(name, value) {
  if (!value) throw new Error(`Missing value for ${name}`);
  console.log(`Adding ${name} to Preview (${BRANCH}) only (value redacted, length=${value.length})`);
  const res = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vercel', 'env', 'add', name, 'preview', BRANCH, '--yes', '--force', '--sensitive'],
    { input: `${value}\n`, encoding: 'utf8', shell: true, windowsHide: true },
  );
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0) throw new Error(`Failed to add ${name}: exit ${res.status}`);
}

addEnv('POSTGRES_PRISMA_URL', preview.POSTGRES_PRISMA_URL);
addEnv('POSTGRES_URL_NON_POOLING', preview.POSTGRES_URL_NON_POOLING);
if (legacy.NEXTAUTH_SECRET) addEnv('NEXTAUTH_SECRET', legacy.NEXTAUTH_SECRET);
addEnv('META_WHATSAPP_MOCK', 'true');

console.log('done — migration-framework-phase1 Preview env bound to tillflow_preview_qa only');
