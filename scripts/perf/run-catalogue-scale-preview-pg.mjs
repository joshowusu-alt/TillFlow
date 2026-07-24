/**
 * Launch Preview Postgres catalogue-scale gate with isolated DB env.
 * Loads tmp/preview-db-restricted.env, refuses non tillflow_preview_qa paths.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const envFile = loadEnv('tmp/preview-db-restricted.env');
for (const key of ['POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING']) {
  const u = new URL(envFile[key]);
  if (u.pathname !== '/tillflow_preview_qa') {
    throw new Error(`${key} path ${u.pathname} is not tillflow_preview_qa`);
  }
}

const env = {
  ...process.env,
  ...envFile,
  DATABASE_URL: envFile.POSTGRES_URL_NON_POOLING,
  NODE_ENV: 'production',
};

const sizes = process.argv.find((a) => a.startsWith('--sizes=')) || '--sizes=1000,10000,50000';
const iters = process.argv.find((a) => a.startsWith('--iters=')) || '--iters=5';

console.log('Generating Postgres Prisma client...');
const gen = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', 'generate', '--schema=prisma/schema.postgres.prisma'],
  { env, encoding: 'utf8', shell: true, stdio: 'inherit' }
);
if (gen.status !== 0) process.exit(gen.status ?? 1);

console.log('Running Preview Postgres catalogue-scale bench...');
const run = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsx', 'scripts/perf/catalogue-scale-preview-pg.ts', sizes, iters],
  { env, encoding: 'utf8', shell: true, stdio: 'inherit' }
);

console.log('Restoring local SQLite Prisma client...');
spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', 'generate', '--schema=prisma/schema.prisma'],
  { env: process.env, encoding: 'utf8', shell: true, stdio: 'inherit' }
);

process.exit(run.status ?? 1);
