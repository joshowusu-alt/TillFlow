/**
 * Fail closed unless DATABASE_URL is a loopback/local test database,
 * or the operator has explicitly marked a proven isolated clone.
 * Never prints the connection string.
 */
function classifyDatabaseUrl(url) {
  if (!url) return 'missing';
  try {
    const normalized = url.replace(/^prisma\+/, '');
    const parsed = new URL(normalized);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return 'loopback';
    if (hostname === 'postgres' || hostname === 'db' || hostname.endsWith('.local')) return 'local-network';
    return 'remote';
  } catch {
    return 'unparseable';
  }
}

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL || '';
const classification = classifyDatabaseUrl(url);

if (process.env.CONTROL_PREVIEW_ISOLATED_DB === '1' && classification !== 'missing') {
  console.log('assert-isolated-database: pass (operator marked isolated clone)');
  process.exit(0);
}

if (classification === 'loopback' || classification === 'local-network') {
  console.log(`assert-isolated-database: pass (${classification})`);
  process.exit(0);
}

console.error('PHASE 0 BLOCKED — ISOLATED PREVIEW DATABASE REQUIRED');
process.exit(1);
