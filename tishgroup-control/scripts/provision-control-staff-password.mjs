/**
 * One-time operator CLI for TishGroup personal-password provisioning.
 * Passwords are read from stdin only. Never pass a password as an argument.
 *
 * Preview rehearsal:
 *   CONTROL_PASSWORD_CUTOVER_ENV=preview CONTROL_PREVIEW_ISOLATED_DB=1 \
 *     node scripts/provision-control-staff-password.mjs --mode preview --staff-id <STAFF_ID> --dry-run
 *
 * Production (after owner authorisation):
 *   CONTROL_PASSWORD_CUTOVER=1 CONTROL_PASSWORD_CUTOVER_ENV=production \
 *     node scripts/provision-control-staff-password.mjs --mode production --staff-id <STAFF_ID> --confirm <STAFF_ID>
 */
import { stdin as input, stderr, stdout } from 'node:process';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const ISOLATED_PREVIEW_HOST_PREFIXES = ['ep-old-sunset-za6o0nyo'];
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
  stderr.write(`${redact(message)}\n`);
  process.exit(1);
}

function redact(value) {
  return String(value)
    .replace(/\$2[aby]\$\d{2}\$[A-Za-z0-9./]{22,}/g, '[redacted-hash]')
    .replace(/password[=:]\s*\S+/gi, 'password=[redacted]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted-db]');
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

function classifyDatabaseUrl(url) {
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

function databaseHostPrefix(url) {
  if (!url) return null;
  try {
    return new URL(url.replace(/^prisma\+/, '')).hostname.toLowerCase().split('.')[0] || null;
  } catch {
    return null;
  }
}

function isIsolatedPreviewHost(url) {
  const prefix = databaseHostPrefix(url);
  if (!prefix) return false;
  return ISOLATED_PREVIEW_HOST_PREFIXES.some((known) => prefix.startsWith(known) || known.startsWith(prefix));
}

function assertEnvironment(mode, databaseUrl) {
  const classification = classifyDatabaseUrl(databaseUrl);
  const isolatedFlag = process.env.CONTROL_PREVIEW_ISOLATED_DB === '1';
  const cutoverFlag = process.env.CONTROL_PASSWORD_CUTOVER === '1';
  const declaredEnv = String(process.env.CONTROL_PASSWORD_CUTOVER_ENV ?? '').trim().toLowerCase();

  if (classification === 'missing' || classification === 'unparseable') {
    throw new Error('Database identity could not be proven. Refusing password cutover.');
  }

  if (mode === 'production') {
    if (!cutoverFlag) {
      throw new Error('Refusing: CONTROL_PASSWORD_CUTOVER=1 is required for Production password provisioning.');
    }
    if (declaredEnv !== 'production') {
      throw new Error('Refusing: CONTROL_PASSWORD_CUTOVER_ENV=production is required for Production mode.');
    }
    if (isolatedFlag || isIsolatedPreviewHost(databaseUrl)) {
      throw new Error('Refusing: isolated Preview database cannot be used in Production mode.');
    }
    if (classification !== 'remote') {
      throw new Error('Refusing: Production password cutover requires a proven remote Production database.');
    }
    return;
  }

  if (declaredEnv !== 'preview') {
    throw new Error('Refusing: CONTROL_PASSWORD_CUTOVER_ENV=preview is required for Preview rehearsal.');
  }
  if (!isolatedFlag) {
    throw new Error('Refusing: Preview password cutover requires CONTROL_PREVIEW_ISOLATED_DB=1.');
  }
  if (classification === 'loopback' || classification === 'local-network') return;
  if (classification === 'remote' && isIsolatedPreviewHost(databaseUrl)) return;
  throw new Error('Refusing: Production database cannot be used in Preview mode.');
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

const dryRun = process.argv.includes('--dry-run');
const mode = argValue('--mode');
const staffId = argValue('--staff-id');
const confirmation = argValue('--confirm');

if (mode !== 'production' && mode !== 'preview') {
  fail('Usage: --mode production|preview --staff-id <id> [--confirm <id>] [--dry-run]');
}
if (!staffId) {
  fail('Refusing: --staff-id is required.');
}

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL || '';

try {
  assertEnvironment(mode, databaseUrl);
} catch (error) {
  fail(error instanceof Error ? error.message : 'Environment refused.');
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

const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});

try {
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
  if (dryRun) {
    stdout.write(`${JSON.stringify({
      dryRun: true,
      role: loaded.role,
      active: loaded.active,
      hasPassword: hadPassword,
      count: 1,
    })}\n`);
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
