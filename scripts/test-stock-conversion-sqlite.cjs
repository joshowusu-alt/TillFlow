/* Disposable SQLite integration checks. Does not read application .env files. */
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const dir = mkdtempSync(join(tmpdir(), 'tillflow-conversion-'));
const previous = (() => { try { return /provider\s*=\s*"postgresql"/.test(readFileSync('node_modules/.prisma/client/schema.prisma', 'utf8')) ? 'prisma/schema.postgres.prisma' : 'prisma/schema.prisma'; } catch { return 'prisma/schema.postgres.prisma'; } })();
const env = { ...process.env, DATABASE_URL: `file:${join(dir, 'test.db')}`, NODE_ENV: 'test', TILLFLOW_INCLUDE_PG_TESTS: '0', TILLFLOW_REQUIRE_ISOLATED_PREVIEW: '0', TILLFLOW_STOCK_CONVERSION_SQLITE_TESTS: '1' };
for (const name of ['DIRECT_URL','POSTGRES_PRISMA_URL','POSTGRES_URL','POSTGRES_URL_NON_POOLING','POSTGRES_URL_NO_SSL','PRISMA_DATABASE_URL','TILLFLOW_TEST_DATABASE_URL']) delete env[name];
function run(file, args) {
  const result = spawnSync(process.execPath, [file, ...args], { env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Test step failed (${result.status}): ${file}`);
}
let status = 0;
try {
  run('node_modules/prisma/build/index.js', ['generate', '--schema=prisma/schema.prisma']);
  run('node_modules/prisma/build/index.js', ['db', 'push', '--schema=prisma/schema.prisma', '--skip-generate']);
  run('node_modules/vitest/vitest.mjs', ['run', 'lib/stock-conversion.test.ts', 'lib/services/stock-conversion.test.ts', 'lib/inventory-value.test.ts', '--reporter=dot']);
} catch (error) { console.error(error.message); status = 1; }
finally {
  try { run('node_modules/prisma/build/index.js', ['generate', `--schema=${previous}`]); } catch { status = 1; }
  rmSync(dir, { recursive: true, force: true });
}
process.exitCode = status;
