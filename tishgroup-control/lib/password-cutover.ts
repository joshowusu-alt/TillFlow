import { ALLOWED_CONTROL_ROLES, MIN_CONTROL_PASSWORD_LENGTH, nextSessionVersion, parseControlStaffRole, type ControlStaffRole } from '@/lib/control-auth';
import { recordAuditInTransaction } from '@/lib/audit';
import {
  ISOLATED_PREVIEW_FINGERPRINT,
  PRODUCTION_FINGERPRINT,
  assertNoForceEscapeHatch,
  assertPasswordCutoverTarget,
  classifyDatabaseUrl,
  parseDatabaseIdentity,
  type DatabaseTargetEnv,
} from '@/lib/database-target';

export { classifyDatabaseUrl, parseDatabaseIdentity, PRODUCTION_FINGERPRINT, ISOLATED_PREVIEW_FINGERPRINT };
export const ISOLATED_PREVIEW_HOST_PREFIXES = [ISOLATED_PREVIEW_FINGERPRINT.hostPrefix];

export type PasswordCutoverMode = 'production' | 'preview';

export type PasswordCutoverEnv = DatabaseTargetEnv;

export class PasswordCutoverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordCutoverError';
  }
}

export function databaseHostPrefix(url: string | undefined | null): string | null {
  return parseDatabaseIdentity(url).hostPrefix;
}

export function assertPasswordCutoverEnvironment(args: {
  mode: PasswordCutoverMode;
  env: PasswordCutoverEnv;
  databaseUrl?: string | null;
  expectedHostPrefix?: string | null;
  expectedDatabase?: string | null;
  expectedUser?: string | null;
  argv?: string[];
}): void {
  try {
    assertNoForceEscapeHatch(args.argv ?? [], args.env as Record<string, string | undefined>);
    assertPasswordCutoverTarget(args);
  } catch (error) {
    throw new PasswordCutoverError(error instanceof Error ? error.message : 'Database target refused.');
  }
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
