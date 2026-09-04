import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  assertConfirmation,
  assertPasswordCutoverEnvironment,
  provisionControlStaffPassword,
  redactCutoverText,
  resolveSingleEligibleStaff,
  validateCutoverPassword,
  type CutoverStaffRow,
  type PasswordCutoverDb,
  type PasswordCutoverTx,
} from '@/lib/password-cutover';

const execFileAsync = promisify(execFile);
const script = 'scripts/provision-control-staff-password.mjs';

const eligible: CutoverStaffRow = {
  id: 'staff-1',
  role: 'CONTROL_ADMIN',
  active: true,
  passwordHash: null,
  sessionVersion: 3,
  email: 'phase0.admin@example.test',
};

function createHarness(options: { failOn?: 'audit' | 'staff'; rows?: CutoverStaffRow[] } = {}) {
  let staff = (options.rows ?? [eligible]).map((row) => ({ ...row }));
  let audits: Array<Record<string, unknown>> = [];

  function snapshot() {
    return { staff: staff.map((row) => ({ ...row })), audits: audits.map((audit) => ({ ...audit })) };
  }
  function restore(s: ReturnType<typeof snapshot>) {
    staff = s.staff;
    audits = s.audits;
  }

  const tx: PasswordCutoverTx = {
    controlStaff: {
      findMany: async () => staff,
      update: async ({ where, data }) => {
        if (options.failOn === 'staff') throw new Error('forced staff mutation failure');
        const row = staff.find((entry) => entry.id === where.id);
        if (!row) throw new Error('missing');
        Object.assign(row, data);
        return row;
      },
    },
    controlAuditLog: {
      create: async ({ data }) => {
        if (options.failOn === 'audit') throw new Error('forced audit failure');
        audits.push(data);
        return { id: `audit-${audits.length}` };
      },
    },
  };

  const db: PasswordCutoverDb = {
    $transaction: async (fn) => {
      const s = snapshot();
      try {
        return await fn(tx);
      } catch (error) {
        restore(s);
        throw error;
      }
    },
  };

  return {
    db,
    get staff() { return staff; },
    get audits() { return audits; },
  };
}

const previewEnv = {
  CONTROL_PASSWORD_CUTOVER_ENV: 'preview',
  CONTROL_PREVIEW_ISOLATED_DB: '1',
  CONTROL_DISPOSABLE_MODE: '1',
  CONTROL_DISPOSABLE_SENTINEL_LABEL: 'tishgroup-phase0-preview',
  CONTROL_PASSWORD_CUTOVER_HOST_PREFIX: 'ep-old-sunset-za6o0nyo',
  CONTROL_PASSWORD_CUTOVER_DATABASE: 'tillflow_preview',
  CONTROL_PASSWORD_CUTOVER_USER: 'tillflow_preview_app',
};
const productionEnv = {
  CONTROL_PASSWORD_CUTOVER: '1',
  CONTROL_PASSWORD_CUTOVER_ENV: 'production',
  CONTROL_PASSWORD_CUTOVER_HOST_PREFIX: 'ep-fancy-darkness-abyuvjxt',
  CONTROL_PASSWORD_CUTOVER_DATABASE: 'neondb',
  CONTROL_PASSWORD_CUTOVER_USER: 'neondb_owner',
};
const productionUrl = 'postgresql://neondb_owner:x@ep-fancy-darkness-abyuvjxt.example.test/neondb';
const previewUrl = 'postgresql://tillflow_preview_app:x@ep-old-sunset-za6o0nyo.neon.example.test/tillflow_preview';
const loopbackUrl = 'postgresql://postgres:postgres@127.0.0.1:5432/tishgroup_ci';

describe('password cutover environment gates', () => {
  it('refuses Production mode without the cutover flag', () => {
    expect(() => assertPasswordCutoverEnvironment({
      mode: 'production',
      env: { ...productionEnv, CONTROL_PASSWORD_CUTOVER: '0' },
      databaseUrl: productionUrl,
      expectedHostPrefix: productionEnv.CONTROL_PASSWORD_CUTOVER_HOST_PREFIX,
      expectedDatabase: productionEnv.CONTROL_PASSWORD_CUTOVER_DATABASE,
      expectedUser: productionEnv.CONTROL_PASSWORD_CUTOVER_USER,
    })).toThrow(/CONTROL_PASSWORD_CUTOVER=1/);
  });

  it('refuses the isolated Preview database in Production mode', () => {
    expect(() => assertPasswordCutoverEnvironment({
      mode: 'production',
      env: productionEnv,
      databaseUrl: previewUrl,
      expectedHostPrefix: previewEnv.CONTROL_PASSWORD_CUTOVER_HOST_PREFIX,
      expectedDatabase: previewEnv.CONTROL_PASSWORD_CUTOVER_DATABASE,
      expectedUser: previewEnv.CONTROL_PASSWORD_CUTOVER_USER,
    })).toThrow(/not the allowlisted Production fingerprint|isolated Preview database/);
  });

  it('refuses Production when Preview mode is requested', () => {
    expect(() => assertPasswordCutoverEnvironment({
      mode: 'preview',
      env: previewEnv,
      databaseUrl: productionUrl,
      expectedHostPrefix: productionEnv.CONTROL_PASSWORD_CUTOVER_HOST_PREFIX,
      expectedDatabase: productionEnv.CONTROL_PASSWORD_CUTOVER_DATABASE,
      expectedUser: productionEnv.CONTROL_PASSWORD_CUTOVER_USER,
    })).toThrow(/Production database cannot be used in Preview mode/);
  });

  it('allows Preview rehearsal on the isolated host', () => {
    expect(() => assertPasswordCutoverEnvironment({
      mode: 'preview',
      env: previewEnv,
      databaseUrl: previewUrl,
      expectedHostPrefix: previewEnv.CONTROL_PASSWORD_CUTOVER_HOST_PREFIX,
      expectedDatabase: previewEnv.CONTROL_PASSWORD_CUTOVER_DATABASE,
      expectedUser: previewEnv.CONTROL_PASSWORD_CUTOVER_USER,
    })).not.toThrow();
  });

  it('allows Preview rehearsal on loopback', () => {
    expect(() => assertPasswordCutoverEnvironment({
      mode: 'preview',
      env: {
        CONTROL_PASSWORD_CUTOVER_ENV: 'preview',
        CONTROL_PREVIEW_ISOLATED_DB: '1',
      },
      databaseUrl: loopbackUrl,
      expectedHostPrefix: '127.0.0.1',
      expectedDatabase: 'tishgroup_ci',
      expectedUser: 'postgres',
    })).not.toThrow();
  });

  it('refuses --force even with a matching Production fingerprint', () => {
    expect(() => assertPasswordCutoverEnvironment({
      mode: 'production',
      env: productionEnv,
      databaseUrl: productionUrl,
      expectedHostPrefix: productionEnv.CONTROL_PASSWORD_CUTOVER_HOST_PREFIX,
      expectedDatabase: productionEnv.CONTROL_PASSWORD_CUTOVER_DATABASE,
      expectedUser: productionEnv.CONTROL_PASSWORD_CUTOVER_USER,
      argv: ['node', 'script.mjs', '--force'],
    })).toThrow(/force/);
  });
});

describe('password cutover staff resolution', () => {
  it('succeeds for a single eligible active staff record', () => {
    expect(resolveSingleEligibleStaff([eligible], 'staff-1').role).toBe('CONTROL_ADMIN');
  });

  it('refuses unknown, duplicate, inactive, and disallowed-role targets', () => {
    expect(() => resolveSingleEligibleStaff([], 'staff-1')).toThrow(/Unknown staff target/);
    expect(() => resolveSingleEligibleStaff([eligible, { ...eligible, email: 'other@example.test' }], 'staff-1')).toThrow(/Duplicate staff target/);
    expect(() => resolveSingleEligibleStaff([{ ...eligible, active: false }], 'staff-1')).toThrow(/Inactive staff/);
    expect(() => resolveSingleEligibleStaff([{ ...eligible, role: 'NOT_A_REAL_ROLE' }], 'staff-1')).toThrow(/Disallowed staff role/);
  });

  it('requires confirmation to match the target', () => {
    expect(() => assertConfirmation('staff-1', 'staff-2', false)).toThrow(/Confirmation did not match/);
    expect(() => assertConfirmation('staff-1', 'staff-1', false)).not.toThrow();
  });
});

describe('password cutover password policy', () => {
  it('rejects weak passwords', () => {
    expect(() => validateCutoverPassword('short')).toThrow(/at least 12/);
    expect(() => validateCutoverPassword('abcdefghijkl')).toThrow(/letter and one number/);
    expect(() => validateCutoverPassword('password12345')).toThrow(/too weak/);
  });

  it('accepts a strong personal password', () => {
    expect(() => validateCutoverPassword('CorrectHorse1!')).not.toThrow();
  });
});

describe('password cutover provisioning', () => {
  const hashPassword = async () => '$2a$12$synthetic.hash.value.not.the.passwordXXXX';

  it('provisions a null-hash staff record, rotates, and invalidates sessions', async () => {
    const harness = createHarness();
    const first = await provisionControlStaffPassword({
      db: harness.db,
      staffId: 'staff-1',
      confirmation: 'staff-1',
      password: 'CorrectHorse1!',
      dryRun: false,
      hashPassword,
    });
    expect(first.dryRun).toBe(false);
    if (first.dryRun) throw new Error('expected apply');
    expect(first.sessionVersion).toBe(4);
    expect(first.hadPassword).toBe(false);
    expect(harness.staff[0].passwordHash).toBe('$2a$12$synthetic.hash.value.not.the.passwordXXXX');
    expect(harness.staff[0].passwordHash).not.toContain('CorrectHorse1!');
    expect(harness.audits).toHaveLength(1);
    expect(JSON.stringify(harness.audits[0])).not.toContain('CorrectHorse1!');

    const second = await provisionControlStaffPassword({
      db: harness.db,
      staffId: 'staff-1',
      confirmation: 'staff-1',
      password: 'CorrectHorse2!',
      dryRun: false,
      hashPassword: async () => '$2a$12$rotated.hash.value.not.the.passwordXXXXXX',
    });
    if (second.dryRun) throw new Error('expected apply');
    expect(second.sessionVersion).toBe(5);
    expect(second.hadPassword).toBe(true);
    expect(harness.audits).toHaveLength(2);
  });

  it('dry-run reports only role, status, and count', async () => {
    const harness = createHarness();
    const result = await provisionControlStaffPassword({
      db: harness.db,
      staffId: 'staff-1',
      dryRun: true,
    });
    expect(result).toEqual({
      dryRun: true,
      staffId: 'staff-1',
      role: 'CONTROL_ADMIN',
      active: true,
      hasPassword: false,
      count: 1,
    });
    expect(harness.staff[0].passwordHash).toBeNull();
    expect(harness.audits).toHaveLength(0);
  });

  it('rolls back the password write when audit fails', async () => {
    const harness = createHarness({ failOn: 'audit' });
    await expect(provisionControlStaffPassword({
      db: harness.db,
      staffId: 'staff-1',
      confirmation: 'staff-1',
      password: 'CorrectHorse1!',
      dryRun: false,
      hashPassword,
    })).rejects.toThrow('forced audit failure');
    expect(harness.staff[0].passwordHash).toBeNull();
    expect(harness.staff[0].sessionVersion).toBe(3);
    expect(harness.audits).toHaveLength(0);
  });

  it('creates no audit when the staff write fails', async () => {
    const harness = createHarness({ failOn: 'staff' });
    await expect(provisionControlStaffPassword({
      db: harness.db,
      staffId: 'staff-1',
      confirmation: 'staff-1',
      password: 'CorrectHorse1!',
      dryRun: false,
      hashPassword,
    })).rejects.toThrow('forced staff mutation failure');
    expect(harness.audits).toHaveLength(0);
    expect(harness.staff[0].passwordHash).toBeNull();
  });
});

describe('password cutover redaction', () => {
  it('redacts hashes, password assignments, and database URLs', () => {
    const redacted = redactCutoverText('password=CorrectHorse1! postgres://u:p@host/db $2a$12$abcdefghijklmnopqrstuvXXXXXXXXXXXX');
    expect(redacted).not.toContain('CorrectHorse1!');
    expect(redacted).not.toContain('postgres://');
    expect(redacted).toContain('[redacted');
  });
});

describe('password cutover CLI', () => {
  const baseEnv = {
    ...process.env,
    CONTROL_PASSWORD_CUTOVER: '0',
    CONTROL_PASSWORD_CUTOVER_ENV: 'production',
    CONTROL_PREVIEW_ISOLATED_DB: '0',
    DATABASE_URL: productionUrl,
    POSTGRES_PRISMA_URL: productionUrl,
    POSTGRES_URL_NON_POOLING: productionUrl,
  };

  it('refuses missing Production cutover flag', async () => {
    await expect(execFileAsync('node', [
      script,
      '--mode', 'production',
      '--staff-id', 'staff-1',
      '--expected-host-prefix', 'ep-fancy-darkness-abyuvjxt',
      '--expected-database', 'neondb',
      '--expected-user', 'neondb_owner',
      '--dry-run',
    ], {
      env: baseEnv,
      timeout: 15_000,
    })).rejects.toMatchObject({
      stderr: expect.stringMatching(/CONTROL_PASSWORD_CUTOVER=1/),
    });
  });

  it('refuses password arguments and does not echo them', async () => {
    try {
      await execFileAsync('node', [script, '--mode', 'preview', '--staff-id', 'staff-1', '--password=CorrectHorse1!'], {
        env: {
          ...baseEnv,
          CONTROL_PASSWORD_CUTOVER_ENV: 'preview',
          CONTROL_PREVIEW_ISOLATED_DB: '1',
          DATABASE_URL: loopbackUrl,
          POSTGRES_PRISMA_URL: loopbackUrl,
          POSTGRES_URL_NON_POOLING: loopbackUrl,
        },
        timeout: 15_000,
      });
      throw new Error('expected refusal');
    } catch (error) {
      const err = error as { stderr?: string; stdout?: string };
      expect(err.stderr).toMatch(/must not be passed as command arguments/);
      expect(err.stderr).not.toContain('CorrectHorse1!');
      expect(err.stdout ?? '').not.toContain('CorrectHorse1!');
    }
  });

  it('refuses --force', async () => {
    await expect(execFileAsync('node', [
      script,
      '--mode', 'production',
      '--staff-id', 'staff-1',
      '--force',
      '--expected-host-prefix', 'ep-fancy-darkness-abyuvjxt',
      '--expected-database', 'neondb',
      '--expected-user', 'neondb_owner',
      '--dry-run',
    ], {
      env: { ...baseEnv, CONTROL_PASSWORD_CUTOVER: '1' },
      timeout: 15_000,
    })).rejects.toMatchObject({
      stderr: expect.stringMatching(/force/),
    });
  });
});
