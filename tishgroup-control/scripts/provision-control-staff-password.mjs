/**
 * One-time operator CLI for TishGroup personal-password provisioning.
 * Passwords are read from stdin only. Never pass a password as an argument.
 *
 * Preview rehearsal:
 *   CONTROL_PASSWORD_CUTOVER_ENV=preview CONTROL_PREVIEW_ISOLATED_DB=1 \
 *   CONTROL_DISPOSABLE_MODE=1 CONTROL_DISPOSABLE_SENTINEL_LABEL=tishgroup-phase0-preview \
 *   CONTROL_PASSWORD_CUTOVER_HOST_PREFIX=ep-old-sunset-za6o0nyo \
 *   CONTROL_PASSWORD_CUTOVER_DATABASE=tillflow_preview \
 *   CONTROL_PASSWORD_CUTOVER_USER=tillflow_preview_app \
 *     node scripts/provision-control-staff-password.mjs --mode preview --staff-id <STAFF_ID> \
 *     --expected-host-prefix ep-old-sunset-za6o0nyo --expected-database tillflow_preview \
 *     --expected-user tillflow_preview_app --confirm-target tishgroup-phase0-preview --dry-run
 *
 * Production (after owner authorisation):
 *   CONTROL_PASSWORD_CUTOVER=1 CONTROL_PASSWORD_CUTOVER_ENV=production \
 *   CONTROL_PASSWORD_CUTOVER_HOST_PREFIX=ep-fancy-darkness-abyuvjxt \
 *   CONTROL_PASSWORD_CUTOVER_DATABASE=neondb \
 *   CONTROL_PASSWORD_CUTOVER_USER=neondb_owner \
 *     node scripts/provision-control-staff-password.mjs --mode production --staff-id <STAFF_ID> \
 *     --expected-host-prefix ep-fancy-darkness-abyuvjxt --expected-database neondb \
 *     --expected-user neondb_owner --confirm <STAFF_ID> --confirm-target ep-fancy-darkness-abyuvjxt
 */
import { stdin as input, stderr, stdout } from 'node:process';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DISPOSABLE_SENTINEL_ID,
  DISPOSABLE_SENTINEL_LABEL,
  ISOLATED_PREVIEW_FINGERPRINT,
  PRODUCTION_FINGERPRINT,
  assertNoForceEscapeHatch,
  assertPasswordCutoverTarget,
  assertTypedConfirmation,
  redactDatabaseText,
} from './lib/database-target.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const MIN_PASSWORD_LENGTH = 12;
const ALLOWED_ROLES = ['CONTROL_ADMIN', 'ACCOUNT_MANAGER', 'COLLECTIONS_AGENT', 'SUPPORT_AGENT'];
const WEAK_PASSWORD_FRAGMENTS = ['password', 'tillflow', 'tishgroup', '123456789012', 'qwertyuiopas'];

for (const envFile of ['.env.production.local', '.env.local', '.env']) {
  const full = resolve(appRoot, envFile);
  if (!existsSync(full)) continue;
  const content = readFileSync(full, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, '');
  }
}

function fail(message) {
  stderr.write(`${redactDatabaseText(message)}\n`);
  process.exit(1);
}

if (process.argv.some((arg) => /^--(password|secret|hash|dsn|database-url)=?/i.test(arg))) {
  fail('Refusing: passwords and connection strings must not be passed as command arguments.');
}

function argValue(name) {
  const prefix = `${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  if (matched) return matched.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }
  return null;
}

function validatePassword(password, email) {
  if (typeof password !== 'string') throw new Error('Password is required.');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > 200) throw new Error('Password is too long.');
  if (/\s/.test(password)) throw new Error('Password must not contain whitespace.');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('Password must contain at least one letter and one number.');
  }
  const lower = password.toLowerCase();
  if (WEAK_PASSWORD_FRAGMENTS.some((fragment) => lower.includes(fragment))) {
    throw new Error('Password is too weak.');
  }
  const local = String(email ?? '').split('@')[0]?.toLowerCase();
  if (local && local.length >= 3 && lower.includes(local)) {
    throw new Error('Password must not contain the staff identifier.');
  }
}

try {
  assertNoForceEscapeHatch(process.argv, process.env);
} catch (error) {
  fail(error instanceof Error ? error.message : 'Force flag refused.');
}

const dryRun = process.argv.includes('--dry-run');
const mode = argValue('--mode');
const staffId = argValue('--staff-id');
const confirmation = argValue('--confirm');
const confirmTarget = argValue('--confirm-target');
const expectedHostPrefix = argValue('--expected-host-prefix');
const expectedDatabase = argValue('--expected-database');
const expectedUser = argValue('--expected-user');

if (mode !== 'production' && mode !== 'preview') {
  fail('Usage: --mode production|preview --staff-id <id> --expected-host-prefix <prefix> --expected-database <name> --expected-user <user> [--confirm <id>] [--confirm-target <id>] [--dry-run]');
}
if (!staffId) {
  fail('Refusing: --staff-id is required.');
}

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL || '';

let identity;
try {
  identity = assertPasswordCutoverTarget({
    mode,
    env: process.env,
    databaseUrl,
    expectedHostPrefix,
    expectedDatabase,
    expectedUser,
  });
} catch (error) {
  fail(error instanceof Error ? error.message : 'Environment refused.');
}

if (!dryRun) {
  try {
    if (mode === 'production') {
      assertTypedConfirmation(PRODUCTION_FINGERPRINT.hostPrefix, confirmTarget);
    } else if (identity.classification === 'remote') {
      assertTypedConfirmation(ISOLATED_PREVIEW_FINGERPRINT.branchLabel, confirmTarget);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Target confirmation refused.');
  }
}

async function readPasswordFromStdin() {
  if (!input.isTTY) {
    const chunks = [];
    for await (const chunk of input) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0] ?? '';
  }

  return new Promise((resolvePassword, reject) => {
    stderr.write('Enter personal password (input hidden): ');
    const wasRaw = input.isRaw;
    const buffer = [];
    const onData = (key) => {
      const str = key.toString('utf8');
      if (str === '\n' || str === '\r' || str === '\u0004') {
        cleanup();
        stderr.write('\n');
        resolvePassword(buffer.join(''));
        return;
      }
      if (str === '\u0003') {
        cleanup();
        reject(new Error('Cancelled'));
        return;
      }
      if (str === '\u007f' || str === '\b') {
        buffer.pop();
        return;
      }
      if (str.length === 1 && str >= ' ') buffer.push(str);
    };
    const cleanup = () => {
      input.off('data', onData);
      if (input.isTTY && typeof input.setRawMode === 'function') {
        input.setRawMode(Boolean(wasRaw));
      }
    };
    if (input.isTTY && typeof input.setRawMode === 'function') {
      input.setRawMode(true);
    }
    input.on('data', onData);
  });
}

async function loadDisposableSentinel(client) {
  try {
    const rows = await client.$queryRaw`
      SELECT id, label FROM "_tishgroup_disposable_sentinel" WHERE id = ${DISPOSABLE_SENTINEL_ID}
    `;
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});

try {
  if (identity.classification === 'remote') {
    const sentinel = await loadDisposableSentinel(prisma);
    if (mode === 'production') {
      if (sentinel) {
        throw new Error('Refusing: Production mode cannot target a disposable database.');
      }
    } else if (!sentinel || sentinel.label !== DISPOSABLE_SENTINEL_LABEL) {
      throw new Error('Refusing: disposable sentinel is missing or does not match the allowlisted Preview branch.');
    }
  }

  const staffRows = await prisma.controlStaff.findMany({
    where: { id: staffId },
    select: { id: true, role: true, active: true, passwordHash: true, sessionVersion: true, email: true },
  });
  if (staffRows.length === 0) throw new Error('Unknown staff target.');
  if (staffRows.length > 1) throw new Error('Duplicate staff target. Refusing to provision.');
  const loaded = staffRows[0];
  if (loaded.id !== staffId) throw new Error('Staff id did not match the loaded record.');
  if (!loaded.active) throw new Error('Inactive staff cannot be provisioned.');
  if (!ALLOWED_ROLES.includes(loaded.role)) throw new Error('Disallowed staff role.');

  const hadPassword = typeof loaded.passwordHash === 'string' && loaded.passwordHash.length > 0;
  stdout.write(`${JSON.stringify({
    step: 'dry-run',
    dryRun: true,
    role: loaded.role,
    active: loaded.active,
    hasPassword: hadPassword,
    count: 1,
    hostPrefix: identity.hostPrefix,
    databaseName: identity.databaseName,
  })}\n`);

  if (dryRun) {
    process.exitCode = 0;
  } else {
    if (!confirmation || confirmation !== staffId) {
      throw new Error('Confirmation did not match the target staff id.');
    }
    const password = await readPasswordFromStdin();
    validatePassword(password, loaded.email);
    const hash = await bcrypt.hash(password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.controlStaff.findMany({
        where: { id: staffId },
        select: { id: true, role: true, active: true, passwordHash: true, sessionVersion: true, email: true },
      });
      if (rows.length !== 1 || rows[0].id !== staffId || !rows[0].active || !ALLOWED_ROLES.includes(rows[0].role)) {
        throw new Error('Staff target changed during provisioning. Refusing.');
      }
      const staff = rows[0];
      const currentVersion = typeof staff.sessionVersion === 'number' && Number.isFinite(staff.sessionVersion)
        ? Math.trunc(staff.sessionVersion)
        : 0;
      const sessionVersion = currentVersion + 1;

      await tx.controlStaff.update({
        where: { id: staff.id },
        data: {
          passwordHash: hash,
          passwordSetAt: new Date(),
          sessionVersion,
        },
      });
      await tx.controlAuditLog.create({
        data: {
          staffId: staff.id,
          staffEmail: 'cutover-operator',
          staffRole: 'SYSTEM',
          action: 'PASSWORD_SET',
          businessId: null,
          summary: `Password provisioned for staff ${staff.id}`,
          metadata: JSON.stringify({ targetStaffId: staff.id, targetRole: staff.role, hadPassword }),
          idempotencyKey: `password-cutover:${staff.id}:${sessionVersion}`,
        },
      });

      return { role: staff.role, sessionVersion, hadPassword };
    });

    stdout.write(`${JSON.stringify({
      step: 'applied',
      dryRun: false,
      role: result.role,
      sessionVersion: result.sessionVersion,
      hadPassword: result.hadPassword,
    })}\n`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : 'Password cutover failed.');
} finally {
  await prisma.$disconnect();
}
