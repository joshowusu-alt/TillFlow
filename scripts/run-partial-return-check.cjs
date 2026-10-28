const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const config = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : { url: 'file:./partial-return-unit.db' };
if (!config.url || (!config.url.startsWith('file:') && !config.expectedHost)) throw Error('Explicit isolated endpoint required');
if (config.expectedHost && new URL(config.url).hostname !== config.expectedHost) throw Error('Endpoint identity mismatch');
const env = { ...process.env, NODE_ENV: 'production', VERCEL_ENV: 'preview', PARTIAL_RETURN_EXPECTED_HOST: config.expectedHost ?? '' };
for (const key of ['DATABASE_URL','DIRECT_URL','POSTGRES_PRISMA_URL','POSTGRES_URL','POSTGRES_URL_NON_POOLING','POSTGRES_URL_NO_SSL','PRISMA_DATABASE_URL']) env[key] = config.url;
const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', "require('react').cache ??= fn => fn; require('./scripts/check-partial-returns.ts');"], { env, stdio: 'inherit' });
process.exit(result.status ?? 1);
