import { ALLOWED_CONTROL_ROLES, MIN_CONTROL_PASSWORD_LENGTH, nextSessionVersion, parseControlStaffRole, type ControlStaffRole } from '@/lib/control-auth';
import { recordAuditInTransaction } from '@/lib/audit';

export const ISOLATED_PREVIEW_HOST_PREFIXES = ['ep-old-sunset-za6o0nyo'];

export type PasswordCutoverMode = 'production' | 'preview';

export type PasswordCutoverEnv = {
  CONTROL_PASSWORD_CUTOVER?: string;
  CONTROL_PASSWORD_CUTOVER_ENV?: string;
  CONTROL_PREVIEW_ISOLATED_DB?: string;
  VERCEL_ENV?: string;
};

export class PasswordCutoverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordCutoverError';
  }
}

export function classifyDatabaseUrl(url: string | undefined | null): 'missing' | 'unparseable' | 'loopback' | 'local-network' | 'remote' {
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

export function databaseHostPrefix(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.replace(/^prisma\+/, ''));
    const host = parsed.hostname.toLowerCase();
    const first = host.split('.')[0] ?? '';
    return first || null;
  } catch {
    return null;
  }
}

function isIsolatedPreviewHost(url: string | undefined | null) {
  const prefix = databaseHostPrefix(url);
  if (!prefix) return false;
  return ISOLATED_PREVIEW_HOST_PREFIXES.some((known) => prefix.startsWith(known) || known.startsWith(prefix));
}

export function assertPasswordCutoverEnvironment(args: {
  mode: PasswordCutoverMode;
  env: PasswordCutoverEnv;
  databaseUrl?: string | null;
}): void {
  const { mode, env, databaseUrl } = args;
  const classification = classifyDatabaseUrl(databaseUrl);
  const isolatedFlag = env.CONTROL_PREVIEW_ISOLATED_DB === '1';
  const cutoverFlag = env.CONTROL_PASSWORD_CUTOVER === '1';
  const declaredEnv = String(env.CONTROL_PASSWORD_CUTOVER_ENV ?? '').trim().toLowerCase();

  if (classification === 'missing' || classification === 'unparseable') {
    throw new PasswordCutoverError('Database identity could not be proven. Refusing password cutover.');
  }

  if (mode === 'production') {
    if (!cutoverFlag) {
      throw new PasswordCutoverError('Refusing: CONTROL_PASSWORD_CUTOVER=1 is required for Production password provisioning.');
    }
    if (declaredEnv !== 'production') {
      throw new PasswordCutoverError('Refusing: CONTROL_PASSWORD_CUTOVER_ENV=production is required for Production mode.');
    }
    if (isolatedFlag) {
      throw new PasswordCutoverError('Refusing: isolated Preview database cannot be used in Production mode.');
    }
    if (isIsolatedPreviewHost(databaseUrl)) {
      throw new PasswordCutoverError('Refusing: isolated Preview database cannot be used in Production mode.');
    }
    if (classification !== 'remote') {
      throw new PasswordCutoverError('Refusing: Production password cutover requires a proven remote Production database.');
    }
    return;
  }

  if (mode !== 'preview') {
    throw new PasswordCutoverError('Refusing: mode must be production or preview.');
  }
  if (declaredEnv !== 'preview') {
    throw new PasswordCutoverError('Refusing: CONTROL_PASSWORD_CUTOVER_ENV=preview is required for Preview rehearsal.');
  }
  if (!isolatedFlag) {
    throw new PasswordCutoverError('Refusing: Preview password cutover requires CONTROL_PREVIEW_ISOLATED_DB=1.');
  }
  if (classification === 'loopback' || classification === 'local-network') {
    return;
  }
  if (classification === 'remote' && isIsolatedPreviewHost(databaseUrl)) {
    return;
  }
  throw new PasswordCutoverError('Refusing: Production database cannot be used in Preview mode.');
}

const WEAK_PASSWORD_FRAGMENTS = ['password', 'tillflow', 'tishgroup', '123456789012', 'qwertyuiopas'];

export function validateCutoverPassword(password: string, opts?: { email?: string | null }): void {
  if (typeof password !== 'string') {
    throw new PasswordCutoverError('Password is required.');
  }
  if (password.length < MIN_CONTROL_PASSWORD_LENGTH) {
    throw new PasswordCutoverError(`Password must be at least ${MIN_CONTROL_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > 200) {
    throw new PasswordCutoverError('Password is too long.');
  }
  if (/\s/.test(password)) {
    throw new PasswordCutoverError('Password must not contain whitespace.');
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new PasswordCutoverError('Password must contain at least one letter and one number.');
  }
  const lower = password.toLowerCase();
  if (WEAK_PASSWORD_FRAGMENTS.some((fragment) => lower.includes(fragment))) {
    throw new PasswordCutoverError('Password is too weak.');
  }
  const local = String(opts?.email ?? '').split('@')[0]?.toLowerCase();
  if (local && local.length >= 3 && lower.includes(local)) {
    throw new PasswordCutoverError('Password must not contain the staff identifier.');
  }
}

export function redactCutoverText(value: string): string {
  return value
    .replace(/\$2[aby]\$\d{2}\$[A-Za-z0-9./]{22,}/g, '[redacted-hash]')
    .replace(/password[=:]\s*\S+/gi, 'password=[redacted]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted-db]');
}

export type CutoverStaffRow = {
  id: string;
  role: string;
  active: boolean;
  passwordHash: string | null;
  sessionVersion: number | null;
  email?: string | null;
};

export function resolveSingleEligibleStaff(rows: CutoverStaffRow[], staffId: string): CutoverStaffRow {
  if (!staffId) {
    throw new PasswordCutoverError('An exact staff id is required.');
  }
  if (rows.length === 0) {
    throw new PasswordCutoverError('Unknown staff target.');
  }
  if (rows.length > 1) {
    throw new PasswordCutoverError('Duplicate staff target. Refusing to provision.');
  }
  const staff = rows[0];
  if (staff.id !== staffId) {
    throw new PasswordCutoverError('Staff id did not match the loaded record.');
  }
  if (!staff.active) {
    throw new PasswordCutoverError('Inactive staff cannot be provisioned.');
  }
  const role = parseControlStaffRole(staff.role);
  if (!role || !(ALLOWED_CONTROL_ROLES as readonly string[]).includes(role)) {
    throw new PasswordCutoverError('Disallowed staff role.');
  }
  return staff;
}

export function assertConfirmation(staffId: string, confirmation: string | null | undefined, dryRun: boolean) {
  if (dryRun) return;
  if (!confirmation || confirmation !== staffId) {
    throw new PasswordCutoverError('Confirmation did not match the target staff id.');
  }
}

export type PasswordCutoverTx = {
  controlStaff: {
    findMany: (args: { where: { id: string }; select: Record<string, boolean> }) => Promise<CutoverStaffRow[]>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  controlAuditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
};

export type PasswordCutoverDb = {
  $transaction: <T>(fn: (tx: PasswordCutoverTx) => Promise<T>) => Promise<T>;
};

export type PasswordCutoverDryRun = {
  dryRun: true;
  staffId: string;
  role: ControlStaffRole;
  active: boolean;
  hasPassword: boolean;
  count: 1;
};

export type PasswordCutoverApplied = {
  dryRun: false;
  staffId: string;
  role: ControlStaffRole;
  sessionVersion: number;
  hadPassword: boolean;
};

export async function provisionControlStaffPassword(args: {
  db: PasswordCutoverDb;
  staffId: string;
  confirmation?: string | null;
  password?: string;
  dryRun: boolean;
  hashPassword?: (password: string) => Promise<string>;
}): Promise<PasswordCutoverDryRun | PasswordCutoverApplied> {
  const loaded = await args.db.$transaction(async (tx) => {
    const rows = await tx.controlStaff.findMany({
      where: { id: args.staffId },
      select: { id: true, role: true, active: true, passwordHash: true, sessionVersion: true, email: true },
    });
    return resolveSingleEligibleStaff(rows, args.staffId);
  });

  const role = parseControlStaffRole(loaded.role) as ControlStaffRole;
  const hadPassword = typeof loaded.passwordHash === 'string' && loaded.passwordHash.length > 0;

  if (args.dryRun) {
    return {
      dryRun: true,
      staffId: loaded.id,
      role,
      active: loaded.active,
      hasPassword: hadPassword,
      count: 1,
    };
  }

  assertConfirmation(loaded.id, args.confirmation, false);
  validateCutoverPassword(args.password ?? '', { email: loaded.email });
  const hashPassword = args.hashPassword;
  if (!hashPassword) {
    throw new PasswordCutoverError('Password hasher is not configured.');
  }
  const hash = await hashPassword(args.password as string);

  return args.db.$transaction(async (tx) => {
    const rows = await tx.controlStaff.findMany({
      where: { id: args.staffId },
      select: { id: true, role: true, active: true, passwordHash: true, sessionVersion: true, email: true },
    });
    const staff = resolveSingleEligibleStaff(rows, args.staffId);
    const confirmedRole = parseControlStaffRole(staff.role) as ControlStaffRole;
    const sessionVersion = nextSessionVersion(staff.sessionVersion);

    await tx.controlStaff.update({
      where: { id: staff.id },
      data: {
        passwordHash: hash,
        passwordSetAt: new Date(),
        sessionVersion,
      },
    });
    await recordAuditInTransaction(tx, {
      staff: { id: staff.id, email: 'cutover-operator', role: 'SYSTEM' },
      action: 'PASSWORD_SET',
      summary: `Password provisioned for staff ${staff.id}`,
      metadata: { targetStaffId: staff.id, targetRole: confirmedRole, hadPassword },
    });

    return {
      dryRun: false as const,
      staffId: staff.id,
      role: confirmedRole,
      sessionVersion,
      hadPassword,
    };
  });
}
