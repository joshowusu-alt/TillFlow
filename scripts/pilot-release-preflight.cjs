/** Read-only configuration validation. Never connects, decrypts or prints values. */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
function inspect(env, nodeVersion=process.versions.node, production=false) {
  assert.equal(nodeVersion.split('.')[0], '22', 'Node22 required');
  assert.equal(env.TILLFLOW_PILOT_MANUAL_PAYMENTS, '1', 'Manual-payment restriction required');
  const pooled = new URL(env.POSTGRES_PRISMA_URL || '');
  const direct = new URL(env.POSTGRES_URL_NON_POOLING || '');
  const host = u => u.hostname.replace(/-pooler(?=\.)/, '');
  assert(['postgres:', 'postgresql:'].includes(pooled.protocol) && ['postgres:', 'postgresql:'].includes(direct.protocol), 'PostgreSQL targets required');
  assert.equal(host(pooled),host(direct),'Pooled/direct hosts differ');
  assert.equal(pooled.pathname,direct.pathname,'Pooled/direct databases differ');
  if(production) {
    assert.equal(env.VERCEL_ENV,'production','Production environment required');
    assert(env.TILLFLOW_EXPECTED_DATABASE_HOST,'Explicit reviewed database host required');
    assert.equal(host(pooled),env.TILLFLOW_EXPECTED_DATABASE_HOST,'Unexpected database host');
    assert.equal(decodeURIComponent(pooled.pathname),'/neondb','Unexpected production database');
    assert(env.CRON_SECRET && env.NEXTAUTH_SECRET,'Cron and authentication secrets required');
  } else {
    assert(['localhost','127.0.0.1'].includes(pooled.hostname),'Isolated rehearsal only');
    assert(/^\/tillflow_ci(?:_|$)/.test(pooled.pathname),'Dedicated CI database required');
  }
  return { passed:true,nodeMajor:22,manualPaymentsOnly:true,production,pooledDirectMatch:true,databaseFingerprint:createHash('sha256').update(host(pooled)+pooled.pathname).digest('hex').slice(0,16),secretsPrinted:false,networkRequests:0 };
}
module.exports={inspect};
if(require.main===module) { try { console.log('RELEASE_PREFLIGHT '+JSON.stringify(inspect(process.env,process.versions.node,process.argv.includes('--production')))); } catch { console.error('Release configuration preflight refused; check Node22, manual-payment flag, reviewed database pair, environment and required secret presence. No values printed.');process.exitCode=1; } }
