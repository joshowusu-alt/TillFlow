// Opt-in verification runs against one disposable preview endpoint, never production.
if (process.env.RUN_SUPPLIER_CREDIT_CHECKS === '1') {
  const { spawnSync } = require('node:child_process');
  const allowed = new Set(['ep-crimson-lake-za8q4axv.c-2.eu-west-2.aws.neon.tech', 'ep-crimson-lake-za8q4axv-pooler.c-2.eu-west-2.aws.neon.tech']);
  const url = process.env.POSTGRES_PRISMA_URL;
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'feature/partial-purchase-returns-consignment' || !url || !allowed.has(new URL(url).hostname)) throw new Error('Supplier credit checks refused: isolated preview identity mismatch');
  const env = { ...process.env, NODE_ENV: 'production', PARTIAL_RETURN_EXPECTED_HOST: new URL(url).hostname };
  for (const key of ['DATABASE_URL', 'DIRECT_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL_NO_SSL', 'PRISMA_DATABASE_URL']) env[key] = url;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', "require('react').cache ??= fn=>fn; require('next/cache').unstable_cache=fn=>fn; require('./scripts/check-supplier-credit-settlement.ts');"], { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
