import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
const { inspect } = createRequire(import.meta.url)('../../scripts/pilot-release-preflight.cjs');
const local = { TILLFLOW_PILOT_MANUAL_PAYMENTS:'1',POSTGRES_PRISMA_URL:'postgresql://fictional:fictional@localhost/tillflow_ci_pilot',POSTGRES_URL_NON_POOLING:'postgresql://fictional:fictional@localhost/tillflow_ci_pilot' };
it('accepts Node22 isolated rehearsal without logging credentials',()=>{
 const result=inspect(local,'22.23.4');expect(result.passed).toBe(true);expect(JSON.stringify(result)).not.toContain('fictional');
});
it.each([
 [{...local,TILLFLOW_PILOT_MANUAL_PAYMENTS:''},'22.0.0'],
 [local,'24.0.0'],
 [{...local,POSTGRES_URL_NON_POOLING:'postgresql://localhost/other'},'22.0.0'],
 [{...local,POSTGRES_PRISMA_URL:'postgresql://remote/neondb',POSTGRES_URL_NON_POOLING:'postgresql://remote/neondb'},'22.0.0'],
])('refuses mismatched or unsafe rehearsal config', (env,node)=>expect(()=>inspect(env,node)).toThrow());
it('requires explicit production identity and secret presence without network access',()=>{
 const env={...local,POSTGRES_PRISMA_URL:'postgresql://fictional:fictional@ep-example-pooler.eu.neon.tech/neondb',POSTGRES_URL_NON_POOLING:'postgresql://fictional:fictional@ep-example.eu.neon.tech/neondb',TILLFLOW_EXPECTED_DATABASE_HOST:'ep-example.eu.neon.tech',VERCEL_ENV:'production',CRON_SECRET:'fictional',NEXTAUTH_SECRET:'fictional'};
 expect(inspect(env,'22.23.4',true).networkRequests).toBe(0);
 expect(()=>inspect({...env,TILLFLOW_EXPECTED_DATABASE_HOST:'other'},'22.23.4',true)).toThrow();
 expect(()=>inspect({...env,CRON_SECRET:''},'22.23.4',true)).toThrow();
});
