/**
 * Seed optional live storefront for Adom Retail Demo.
 * Usage: ALLOW_SEED=true node scripts/seed-adom-retail-demo.mjs
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = path.join(root, '..');

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsx', path.join(repoRoot, 'scripts', 'seed-adom-retail-demo-runner.ts')],
  { cwd: repoRoot, stdio: 'inherit', env: { ...process.env } }
);

child.on('exit', (code) => process.exit(code ?? 1));
