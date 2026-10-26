/**
 * Script-side copy of lib/database-target.ts. Keep constants and fail-closed
 * rules identical. Never log connection strings.
 */

export const PRODUCTION_FINGERPRINT = {
  hostPrefix: 'ep-fancy-darkness-abyuvjxt',
  databaseName: 'neondb',
  user: 'neondb_owner',
};

export const ISOLATED_PREVIEW_FINGERPRINT = {
  hostPrefix: 'ep-old-sunset-za6o0nyo',
  databaseName: 'tillflow_preview',
  user: 'tillflow_preview_app',
  branchLabel: 'tishgroup-phase0-preview',
  neonBranchId: 'br-shy-mountain-zax4ykll',
};

export const DISPOSABLE_SENTINEL_TABLE = '_tishgroup_disposable_sentinel';
export const DISPOSABLE_SENTINEL_ID = 'tishgroup-phase0';
export const DISPOSABLE_SENTINEL_LABEL = 'tishgroup-phase0-preview';
export const CI_DISPOSABLE_DATABASE_PREFIX = 'tishgroup_ci';

export function canonicalHostPrefix(hostname) {
  const lower = String(hostname ?? '').toLowerCase();
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1') return lower;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) return lower;
  const first = lower.split('.')[0] ?? '';
  return first.replace(/-pooler$/, '');
}

export function classifyDatabaseUrl(url) {
  if (!url) return 'missing';
  try {
    const parsed = new URL(url.replace(/^prisma\+/, ''));
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return 'loopback';
    if (hostname === 'postgres' || hostname === 'db' || hostname.endsWith('.local')) return 'local-network';
    return 'remote';
  } catch {
    return 'unparseable';
  }
}

export function parseDatabaseIdentity(url) {
  const classification = classifyDatabaseUrl(url);
  if (classification === 'missing' || classification === 'unparseable') {
    return { classification, hostPrefix: null, databaseName: null, user: null };
  }
  try {
    const parsed = new URL(String(url).replace(/^prisma\+/, ''));
    const databaseName = decodeURIComponent((parsed.pathname || '').replace(/^\//, '').split('/')[0] || '') || null;
    return {
      classification,
      hostPrefix: canonicalHostPrefix(parsed.hostname),
      databaseName,
      user: parsed.username ? decodeURIComponent(parsed.username) : null,
    };
  } catch {
    return { classification: 'unparseable', hostPrefix: null, databaseName: null, user: null };
  }
}

export function fingerprintsMatch(actual, expected) {
  return actual.hostPrefix === expected.hostPrefix
    && actual.databaseName === expected.databaseName
    && actual.user === expected.user;
}

export function isProductionFingerprint(identity) {
  return fingerprintsMatch(identity, PRODUCTION_FINGERPRINT);
}

export function isIsolatedPreviewFingerprint(identity) {
  return fingerprintsMatch(identity, ISOLATED_PREVIEW_FINGERPRINT);
}

export function isCiDisposableDatabaseName(name) {
  return typeof name === 'string' && name.startsWith(CI_DISPOSABLE_DATABASE_PREFIX);
}

export function assertNoForceEscapeHatch(argv = process.argv, env = process.env) {
  const forceArg = argv.some((arg) => /^--force(=|$)/i.test(arg) || arg === '-f');
  const forceEnv = ['FORCE', 'CONTROL_FORCE', 'CONTROL_DB_FORCE', 'ALLOW_DESTRUCTIVE'].some((key) => {
    const value = String(env[key] ?? '').trim();
    return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
  });
  if (forceArg || forceEnv) {
    throw new Error('Refusing: undocumented force/override flags are not permitted.');
  }
}

export function assertExpectedIdentity({ identity, expectedHostPrefix, expectedDatabase, expectedUser }) {
  if (!expectedHostPrefix || !expectedDatabase || !expectedUser) {
    throw new Error('Refusing: expected host, database name, and user must be supplied explicitly.');
  }
  if (identity.hostPrefix !== expectedHostPrefix) {
    throw new Error('Refusing: database host prefix did not match the expected identity.');
  }
  if (identity.databaseName !== expectedDatabase) {
    throw new Error('Refusing: database name did not match the expected identity.');
  }
  if (identity.user !== expectedUser) {
    throw new Error('Refusing: database user did not match the expected identity.');
  }
}

export function assertTypedConfirmation(expected, confirmation) {
  if (!confirmation || confirmation !== expected) {
    throw new Error('Refusing: typed confirmation did not match the non-secret target identifier.');
  }
}

export function assertLoopbackDestructiveTarget(url, databaseName) {
  const identity = parseDatabaseIdentity(url);
  if (identity.classification !== 'loopback') {
    throw new Error('Refusing: destructive database commands are loopback-only. Remote DROP/reset/truncate is not authorised.');
  }
  if (!isCiDisposableDatabaseName(databaseName)) {
    throw new Error('Refusing: destructive commands may only target tishgroup_ci* databases.');
  }
}

export function assertPasswordCutoverTarget({
  mode,
  env,
  databaseUrl,
  expectedHostPrefix,
  expectedDatabase,
  expectedUser,
}) {
  const identity = parseDatabaseIdentity(databaseUrl);
  const declaredEnv = String(env.CONTROL_PASSWORD_CUTOVER_ENV ?? '').trim().toLowerCase();
  const hostPrefix = expectedHostPrefix ?? env.CONTROL_PASSWORD_CUTOVER_HOST_PREFIX ?? null;
  const databaseName = expectedDatabase ?? env.CONTROL_PASSWORD_CUTOVER_DATABASE ?? null;
  const user = expectedUser ?? env.CONTROL_PASSWORD_CUTOVER_USER ?? null;

  if (identity.classification === 'missing' || identity.classification === 'unparseable') {
    throw new Error('Database identity could not be proven. Refusing password cutover.');
  }

  assertExpectedIdentity({ identity, expectedHostPrefix: hostPrefix, expectedDatabase: databaseName, expectedUser: user });

  if (mode === 'production') {
    if (env.CONTROL_PASSWORD_CUTOVER !== '1') {
      throw new Error('Refusing: CONTROL_PASSWORD_CUTOVER=1 is required for Production password provisioning.');
    }
    if (declaredEnv !== 'production') {
      throw new Error('Refusing: CONTROL_PASSWORD_CUTOVER_ENV=production is required for Production mode.');
    }
    if (env.CONTROL_PREVIEW_ISOLATED_DB === '1' || env.CONTROL_DISPOSABLE_MODE === '1') {
      throw new Error('Refusing: disposable/Preview flags cannot be set in Production mode.');
    }
    if (identity.classification !== 'remote') {
      throw new Error('Refusing: Production password cutover requires the proven Production database.');
    }
    if (!isProductionFingerprint(identity)) {
      throw new Error('Refusing: database is not the allowlisted Production fingerprint.');
    }
    if (isIsolatedPreviewFingerprint(identity)) {
      throw new Error('Refusing: isolated Preview database cannot be used in Production mode.');
    }
    return identity;
  }

  if (declaredEnv !== 'preview') {
    throw new Error('Refusing: CONTROL_PASSWORD_CUTOVER_ENV=preview is required for Preview rehearsal.');
  }
  if (env.CONTROL_PREVIEW_ISOLATED_DB !== '1') {
    throw new Error('Refusing: Preview password cutover requires CONTROL_PREVIEW_ISOLATED_DB=1.');
  }

  if (identity.classification === 'loopback' || identity.classification === 'local-network') {
    if (env.CONTROL_CI_DISPOSABLE_DB !== '1' && identity.classification === 'local-network') {
      throw new Error('Refusing: local-network Preview cutover requires CONTROL_CI_DISPOSABLE_DB=1.');
    }
    return identity;
  }

  if (env.CONTROL_DISPOSABLE_MODE !== '1') {
    throw new Error('Refusing: remote Preview operations require CONTROL_DISPOSABLE_MODE=1 and a disposable sentinel.');
  }
  if (String(env.CONTROL_DISPOSABLE_SENTINEL_LABEL ?? '').trim() !== DISPOSABLE_SENTINEL_LABEL) {
    throw new Error('Refusing: disposable sentinel label did not match the allowlisted Preview branch.');
  }
  if (isProductionFingerprint(identity)) {
    throw new Error('Refusing: Production database cannot be used in Preview mode.');
  }
  if (!isIsolatedPreviewFingerprint(identity)) {
    throw new Error('Refusing: unknown database cannot be used in Preview mode.');
  }
  return identity;
}

export function assertDisposableRemoteTarget({
  env,
  databaseUrl,
  expectedHostPrefix,
  expectedDatabase,
  expectedUser,
  confirmTarget,
}) {
  const identity = parseDatabaseIdentity(databaseUrl);
  if (identity.classification === 'loopback') {
    return identity;
  }
  if (identity.classification !== 'remote') {
    throw new Error('Refusing: disposable remote operations require a proven isolated Preview database.');
  }
  if (env.CONTROL_DISPOSABLE_MODE !== '1' || env.CONTROL_PREVIEW_ISOLATED_DB !== '1') {
    throw new Error('Refusing: a boolean isolated flag is not enough. Disposable mode must be explicit.');
  }
  assertExpectedIdentity({
    identity,
    expectedHostPrefix: expectedHostPrefix ?? env.CONTROL_PASSWORD_CUTOVER_HOST_PREFIX ?? ISOLATED_PREVIEW_FINGERPRINT.hostPrefix,
    expectedDatabase: expectedDatabase ?? env.CONTROL_PASSWORD_CUTOVER_DATABASE ?? ISOLATED_PREVIEW_FINGERPRINT.databaseName,
    expectedUser: expectedUser ?? env.CONTROL_PASSWORD_CUTOVER_USER ?? ISOLATED_PREVIEW_FINGERPRINT.user,
  });
  if (!isIsolatedPreviewFingerprint(identity) || isProductionFingerprint(identity)) {
    throw new Error('Refusing: target is not the allowlisted disposable Preview database.');
  }
  assertTypedConfirmation(DISPOSABLE_SENTINEL_LABEL, confirmTarget ?? env.CONTROL_DISPOSABLE_SENTINEL_LABEL);
  return identity;
}

export function redactDatabaseText(value) {
  return String(value)
    .replace(/\$2[aby]\$\d{2}\$[A-Za-z0-9./]{22,}/g, '[redacted-hash]')
    .replace(/password[=:]\s*\S+/gi, 'password=[redacted]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted-db]');
}
