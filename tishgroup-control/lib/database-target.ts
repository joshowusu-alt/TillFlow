/**
 * Fail-closed database identity for TishGroup password cutover and
 * disposable/destructive scripts. Never log connection strings.
 */

export const PRODUCTION_FINGERPRINT = {
  hostPrefix: 'ep-fancy-darkness-abyuvjxt',
  databaseName: 'neondb',
  user: 'neondb_owner',
} as const;

export const ISOLATED_PREVIEW_FINGERPRINT = {
  hostPrefix: 'ep-old-sunset-za6o0nyo',
  databaseName: 'tillflow_preview',
  user: 'tillflow_preview_app',
  branchLabel: 'tishgroup-phase0-preview',
  neonBranchId: 'br-shy-mountain-zax4ykll',
} as const;

export const DISPOSABLE_SENTINEL_TABLE = '_tishgroup_disposable_sentinel';
export const DISPOSABLE_SENTINEL_ID = 'tishgroup-phase0';
export const DISPOSABLE_SENTINEL_LABEL = 'tishgroup-phase0-preview';
export const CI_DISPOSABLE_DATABASE_PREFIX = 'tishgroup_ci';

export type DatabaseClassification = 'missing' | 'unparseable' | 'loopback' | 'local-network' | 'remote';

export type ParsedDatabaseIdentity = {
  classification: DatabaseClassification;
  hostPrefix: string | null;
  databaseName: string | null;
  user: string | null;
};

export type DatabaseTargetEnv = {
  CONTROL_PASSWORD_CUTOVER?: string;
  CONTROL_PASSWORD_CUTOVER_ENV?: string;
  CONTROL_PASSWORD_CUTOVER_HOST_PREFIX?: string;
  CONTROL_PASSWORD_CUTOVER_DATABASE?: string;
  CONTROL_PASSWORD_CUTOVER_USER?: string;
  CONTROL_PREVIEW_ISOLATED_DB?: string;
  CONTROL_DISPOSABLE_MODE?: string;
  CONTROL_DISPOSABLE_SENTINEL_LABEL?: string;
  CONTROL_CI_DISPOSABLE_DB?: string;
  VERCEL_ENV?: string;
};

export class DatabaseTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseTargetError';
  }
}

export function canonicalHostPrefix(hostname: string): string {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1') return lower;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) return lower;
  const first = lower.split('.')[0] ?? '';
  return first.replace(/-pooler$/, '');
}

export function classifyDatabaseUrl(url: string | undefined | null): DatabaseClassification {
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

export function parseDatabaseIdentity(url: string | undefined | null): ParsedDatabaseIdentity {
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

export function fingerprintsMatch(
  actual: Pick<ParsedDatabaseIdentity, 'hostPrefix' | 'databaseName' | 'user'>,
  expected: { hostPrefix: string; databaseName: string; user: string },
): boolean {
  return actual.hostPrefix === expected.hostPrefix
    && actual.databaseName === expected.databaseName
    && actual.user === expected.user;
}

export function isProductionFingerprint(identity: ParsedDatabaseIdentity): boolean {
  return fingerprintsMatch(identity, PRODUCTION_FINGERPRINT);
}

export function isIsolatedPreviewFingerprint(identity: ParsedDatabaseIdentity): boolean {
  return fingerprintsMatch(identity, ISOLATED_PREVIEW_FINGERPRINT);
}

export function isCiDisposableDatabaseName(name: string | null | undefined): boolean {
  return typeof name === 'string' && name.startsWith(CI_DISPOSABLE_DATABASE_PREFIX);
}

export function assertNoForceEscapeHatch(argv: string[] = [], env: Record<string, string | undefined> = {}): void {
  const forceArg = argv.some((arg) => /^--force(=|$)/i.test(arg) || arg === '-f');
  const forceEnv = ['FORCE', 'CONTROL_FORCE', 'CONTROL_DB_FORCE', 'ALLOW_DESTRUCTIVE'].some((key) => {
    const value = String(env[key] ?? '').trim();
    return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
  });
  if (forceArg || forceEnv) {
    throw new DatabaseTargetError('Refusing: undocumented force/override flags are not permitted.');
  }
}

export function assertExpectedIdentity(args: {
  identity: ParsedDatabaseIdentity;
  expectedHostPrefix?: string | null;
  expectedDatabase?: string | null;
  expectedUser?: string | null;
}): void {
  const { identity, expectedHostPrefix, expectedDatabase, expectedUser } = args;
  if (!expectedHostPrefix || !expectedDatabase || !expectedUser) {
    throw new DatabaseTargetError('Refusing: expected host, database name, and user must be supplied explicitly.');
  }
  if (identity.hostPrefix !== expectedHostPrefix) {
    throw new DatabaseTargetError('Refusing: database host prefix did not match the expected identity.');
  }
  if (identity.databaseName !== expectedDatabase) {
    throw new DatabaseTargetError('Refusing: database name did not match the expected identity.');
  }
  if (identity.user !== expectedUser) {
    throw new DatabaseTargetError('Refusing: database user did not match the expected identity.');
  }
}

export function assertTypedConfirmation(expected: string, confirmation: string | null | undefined): void {
  if (!confirmation || confirmation !== expected) {
    throw new DatabaseTargetError('Refusing: typed confirmation did not match the non-secret target identifier.');
  }
}

export function assertLoopbackDestructiveTarget(url: string | undefined | null, databaseName: string): void {
  const identity = parseDatabaseIdentity(url);
  if (identity.classification !== 'loopback') {
    throw new DatabaseTargetError('Refusing: destructive database commands are loopback-only. Remote DROP/reset/truncate is not authorised.');
  }
  if (!isCiDisposableDatabaseName(databaseName)) {
    throw new DatabaseTargetError('Refusing: destructive commands may only target tishgroup_ci* databases.');
  }
}

export function assertPasswordCutoverTarget(args: {
  mode: 'production' | 'preview';
  env: DatabaseTargetEnv;
  databaseUrl?: string | null;
  expectedHostPrefix?: string | null;
  expectedDatabase?: string | null;
  expectedUser?: string | null;
}): ParsedDatabaseIdentity {
  const { mode, env } = args;
  const identity = parseDatabaseIdentity(args.databaseUrl);
  const declaredEnv = String(env.CONTROL_PASSWORD_CUTOVER_ENV ?? '').trim().toLowerCase();
  const expectedHostPrefix = args.expectedHostPrefix ?? env.CONTROL_PASSWORD_CUTOVER_HOST_PREFIX ?? null;
  const expectedDatabase = args.expectedDatabase ?? env.CONTROL_PASSWORD_CUTOVER_DATABASE ?? null;
  const expectedUser = args.expectedUser ?? env.CONTROL_PASSWORD_CUTOVER_USER ?? null;

  if (identity.classification === 'missing' || identity.classification === 'unparseable') {
    throw new DatabaseTargetError('Database identity could not be proven. Refusing password cutover.');
  }

  assertExpectedIdentity({ identity, expectedHostPrefix, expectedDatabase, expectedUser });

  if (mode === 'production') {
    if (env.CONTROL_PASSWORD_CUTOVER !== '1') {
      throw new DatabaseTargetError('Refusing: CONTROL_PASSWORD_CUTOVER=1 is required for Production password provisioning.');
    }
    if (declaredEnv !== 'production') {
      throw new DatabaseTargetError('Refusing: CONTROL_PASSWORD_CUTOVER_ENV=production is required for Production mode.');
    }
    if (env.CONTROL_PREVIEW_ISOLATED_DB === '1' || env.CONTROL_DISPOSABLE_MODE === '1') {
      throw new DatabaseTargetError('Refusing: disposable/Preview flags cannot be set in Production mode.');
    }
    if (identity.classification !== 'remote') {
      throw new DatabaseTargetError('Refusing: Production password cutover requires the proven Production database.');
    }
    if (!isProductionFingerprint(identity)) {
      throw new DatabaseTargetError('Refusing: database is not the allowlisted Production fingerprint.');
    }
    if (isIsolatedPreviewFingerprint(identity)) {
      throw new DatabaseTargetError('Refusing: isolated Preview database cannot be used in Production mode.');
    }
    return identity;
  }

  if (declaredEnv !== 'preview') {
    throw new DatabaseTargetError('Refusing: CONTROL_PASSWORD_CUTOVER_ENV=preview is required for Preview rehearsal.');
  }
  if (env.CONTROL_PREVIEW_ISOLATED_DB !== '1') {
    throw new DatabaseTargetError('Refusing: Preview password cutover requires CONTROL_PREVIEW_ISOLATED_DB=1.');
  }

  if (identity.classification === 'loopback' || identity.classification === 'local-network') {
    if (env.CONTROL_CI_DISPOSABLE_DB !== '1' && identity.classification === 'local-network') {
      throw new DatabaseTargetError('Refusing: local-network Preview cutover requires CONTROL_CI_DISPOSABLE_DB=1.');
    }
    return identity;
  }

  if (env.CONTROL_DISPOSABLE_MODE !== '1') {
    throw new DatabaseTargetError('Refusing: remote Preview operations require CONTROL_DISPOSABLE_MODE=1 and a disposable sentinel.');
  }
  if (String(env.CONTROL_DISPOSABLE_SENTINEL_LABEL ?? '').trim() !== DISPOSABLE_SENTINEL_LABEL) {
    throw new DatabaseTargetError('Refusing: disposable sentinel label did not match the allowlisted Preview branch.');
  }
  if (isProductionFingerprint(identity)) {
    throw new DatabaseTargetError('Refusing: Production database cannot be used in Preview mode.');
  }
  if (!isIsolatedPreviewFingerprint(identity)) {
    throw new DatabaseTargetError('Refusing: unknown database cannot be used in Preview mode.');
  }
  return identity;
}

export function assertDisposableRemoteTarget(args: {
  env: DatabaseTargetEnv;
  databaseUrl?: string | null;
  expectedHostPrefix?: string | null;
  expectedDatabase?: string | null;
  expectedUser?: string | null;
  confirmTarget?: string | null;
}): ParsedDatabaseIdentity {
  const identity = parseDatabaseIdentity(args.databaseUrl);
  if (identity.classification === 'loopback') {
    return identity;
  }
  if (identity.classification !== 'remote') {
    throw new DatabaseTargetError('Refusing: disposable remote operations require a proven isolated Preview database.');
  }
  if (args.env.CONTROL_DISPOSABLE_MODE !== '1' || args.env.CONTROL_PREVIEW_ISOLATED_DB !== '1') {
    throw new DatabaseTargetError('Refusing: a boolean isolated flag is not enough. Disposable mode must be explicit.');
  }
  assertExpectedIdentity({
    identity,
    expectedHostPrefix: args.expectedHostPrefix ?? args.env.CONTROL_PASSWORD_CUTOVER_HOST_PREFIX ?? ISOLATED_PREVIEW_FINGERPRINT.hostPrefix,
    expectedDatabase: args.expectedDatabase ?? args.env.CONTROL_PASSWORD_CUTOVER_DATABASE ?? ISOLATED_PREVIEW_FINGERPRINT.databaseName,
    expectedUser: args.expectedUser ?? args.env.CONTROL_PASSWORD_CUTOVER_USER ?? ISOLATED_PREVIEW_FINGERPRINT.user,
  });
  if (!isIsolatedPreviewFingerprint(identity) || isProductionFingerprint(identity)) {
    throw new DatabaseTargetError('Refusing: target is not the allowlisted disposable Preview database.');
  }
  assertTypedConfirmation(DISPOSABLE_SENTINEL_LABEL, args.confirmTarget ?? args.env.CONTROL_DISPOSABLE_SENTINEL_LABEL);
  return identity;
}
