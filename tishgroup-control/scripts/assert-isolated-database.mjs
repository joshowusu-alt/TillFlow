/**
 * Fail closed unless DATABASE_URL is loopback, or a proven isolated Preview
 * fingerprint. CONTROL_PREVIEW_ISOLATED_DB=1 is not enough for an unknown host.
 * Never prints the connection string.
 */
import {
  classifyDatabaseUrl,
  isIsolatedPreviewFingerprint,
  isProductionFingerprint,
  parseDatabaseIdentity,
} from './lib/database-target.mjs';

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL || '';
const identity = parseDatabaseIdentity(url);
const classification = classifyDatabaseUrl(url);

if (isProductionFingerprint(identity)) {
  console.error('PHASE 0 BLOCKED — PRODUCTION DATABASE REFUSED');
  process.exit(1);
}

if (classification === 'loopback' || (classification === 'local-network' && process.env.CONTROL_CI_DISPOSABLE_DB === '1')) {
  console.log(`assert-isolated-database: pass (${classification})`);
  process.exit(0);
}

if (process.env.CONTROL_PREVIEW_ISOLATED_DB === '1' && isIsolatedPreviewFingerprint(identity)) {
  console.log('assert-isolated-database: pass (isolated preview fingerprint)');
  process.exit(0);
}

console.error('PHASE 0 BLOCKED — ISOLATED PREVIEW DATABASE REQUIRED');
process.exit(1);
