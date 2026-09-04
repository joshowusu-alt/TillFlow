'use server';

import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { recordAuditInTransaction } from '@/lib/audit';
import {
  canAuthenticateStaffPassword,
  controlAuthConfigured,
  createControlSession,
  isMissingControlStaffSchemaError,
  MIN_CONTROL_PASSWORD_LENGTH,
  nextSessionVersion,
  parseControlStaffRole,
  requireControlStaffForMutation,
} from '@/lib/control-auth';
import { checkRateLimit, LOGIN_RATE_LIMIT } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import { safeReturnPath } from '@/lib/safe-return-path';
import { prisma } from '@/lib/prisma';

const INVALID_CREDENTIALS = 'Invalid credentials.';

function readRequiredField(formData: FormData, name: string) {
  return String(formData.get(name) ?? '').trim();
}

function redirectInvalidCredentials(): never {
  redirect(`/login?error=${encodeURIComponent(INVALID_CREDENTIALS)}`);
}

export async function loginControlStaffAction(formData: FormData): Promise<void> {
  const email = readRequiredField(formData, 'email').toLowerCase();
  const credential = readRequiredField(formData, 'password');

  const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rateLimitKey = `login:${ip}`;
  const { allowed, retryAfterMs } = checkRateLimit('login', rateLimitKey, LOGIN_RATE_LIMIT);
  if (!allowed) {
    const retryMins = Math.ceil(retryAfterMs / 60000);
    redirect(`/login?error=Too many login attempts. Try again in ${retryMins} minute${retryMins === 1 ? '' : 's'}.`);
  }

  if (!controlAuthConfigured()) {
    redirect('/login?error=Control-plane session secret is not configured.');
  }

  if (!email || !credential) {
    redirect('/login?error=Email and password are required.');
  }

  try {
    let staff: {
      id: string;
      name: string;
      email: string;
      role: string;
      active: boolean;
      passwordHash: string | null;
      sessionVersion: number;
    } | null = null;

    try {
      staff = await prisma.controlStaff.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          passwordHash: true,
          sessionVersion: true,
        },
      });
    } catch (error) {
      if (isMissingControlStaffSchemaError(error)) {
        redirect('/login?error=Control-plane database tables are not ready yet. Apply migrations first.');
      }
      throw error;
    }

    if (!staff) {
      await captureError({
        context: 'login:unknown_email',
        error: new Error('Login attempt for unknown email'),
        staffEmail: email,
        staffRole: 'UNKNOWN',
        metadata: { ip },
      });
      redirectInvalidCredentials();
    }

    const role = parseControlStaffRole(staff.role);
    if (!role) {
      await captureError({
        context: 'login:unknown_role',
        error: new Error('Login attempt for staff with unknown role'),
        staffId: staff.id,
        staffEmail: email,
        staffRole: staff.role,
        metadata: { ip },
      });
      redirectInvalidCredentials();
    }

    if (!staff.active) {
      await captureError({
        context: 'login:inactive_account',
        error: new Error('Login attempt on inactive account'),
        staffId: staff.id,
        staffEmail: email,
        staffRole: role,
        metadata: { ip },
      });
      redirectInvalidCredentials();
    }

    // Null hash cannot authenticate. The retired shared bootstrap key never signs in a staff identity.
    if (!canAuthenticateStaffPassword(staff.passwordHash)) {
      await captureError({
        context: 'login:password_not_set',
        error: new Error('Login attempt with unset personal password'),
        staffId: staff.id,
        staffEmail: email,
        staffRole: role,
        metadata: { ip },
      });
      redirectInvalidCredentials();
    }

    const valid = await bcrypt.compare(credential, staff.passwordHash as string);
    if (!valid) {
      await captureError({
        context: 'login:bad_password',
        error: new Error('Invalid password attempt'),
        staffId: staff.id,
        staffEmail: email,
        staffRole: role,
        metadata: { ip },
      });
      redirectInvalidCredentials();
    }

    await prisma.$transaction(async (tx) => {
      await tx.controlStaff.update({
        where: { id: staff.id },
        data: { lastLoginAt: new Date() },
      });
      await recordAuditInTransaction(tx, {
        staff: { id: staff.id, email: staff.email, role },
        action: 'LOGIN_SUCCESS',
        summary: 'Control staff signed in',
        metadata: { ip },
      });
    });

    await createControlSession({
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role,
      sessionVersion: staff.sessionVersion,
    });
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw error;
    await captureError({ context: 'login:unexpected_error', error, staffEmail: email, staffRole: 'UNKNOWN' });
    redirect(`/login?error=${encodeURIComponent('Unable to sign in.')}`);
  }

  redirect(safeReturnPath(readRequiredField(formData, 'next'), '/'));
}

export async function setStaffPasswordAction(formData: FormData): Promise<void> {
  const actor = await requireControlStaffForMutation(['CONTROL_ADMIN']);

  const staffId = String(formData.get('staffId') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!staffId || password.length < MIN_CONTROL_PASSWORD_LENGTH) {
    redirect(`/staff?error=Password must be at least ${MIN_CONTROL_PASSWORD_LENGTH} characters.`);
  }

  const target = await prisma.controlStaff.findUnique({
    where: { id: staffId },
    select: { id: true, email: true, role: true, sessionVersion: true },
  });

  if (!target) {
    redirect('/staff?error=Staff member was not found.');
  }

  const targetRole = parseControlStaffRole(target.role);
  if (!targetRole) {
    redirect('/staff?error=Staff member has a role that is not allowlisted.');
  }

  const hash = await bcrypt.hash(password, 12);
  const sessionVersion = nextSessionVersion(target.sessionVersion);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.controlStaff.update({
        where: { id: target.id },
        data: {
          passwordHash: hash,
          passwordSetAt: new Date(),
          sessionVersion,
        },
      });
      await recordAuditInTransaction(tx, {
        staff: actor,
        action: 'PASSWORD_SET',
        summary: `Password set for staff ${target.id}`,
        metadata: { targetStaffId: target.id, targetRole },
      });
    });
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw error;
    redirect('/staff?error=Failed to set password. Check the staff ID and try again.');
  }

  const { revalidatePath } = await import('next/cache');
  revalidatePath('/staff');
  redirect('/staff?updated=staff');
}
