'use server';

import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { controlAuthConfigured, controlBootstrapKeyConfigured, createControlSession, findOrBootstrapControlStaff, isMissingControlStaffSchemaError, normalizeRole } from '@/lib/control-auth';
import { checkRateLimit, LOGIN_RATE_LIMIT } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';

function readRequiredField(formData: FormData, name: string) {
  return String(formData.get(name) ?? '').trim();
}

export async function loginControlStaffAction(formData: FormData): Promise<void> {
  const email = readRequiredField(formData, 'email').toLowerCase();
  const credential = readRequiredField(formData, 'accessKey');

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
    let staff: { id: string; name: string; email: string; role: string; active: boolean; passwordHash: string | null } | null = null;

    try {
      staff = await prisma.controlStaff.findUnique({
        where: { email },
        select: { id: true, name: true, email: true, role: true, active: true, passwordHash: true },
      });
    } catch (error) {
      if (isMissingControlStaffSchemaError(error)) {
        redirect('/login?error=Control-plane database tables are not ready yet. Apply migrations first.');
      }
      throw error;
    }

    if (!staff) {
      // Bootstrap path: allow first admin setup via CONTROL_BOOTSTRAP_ADMIN_EMAIL
      if (!controlBootstrapKeyConfigured()) {
        redirect('/login?error=Shared bootstrap key is not configured. Ask a Control admin to create your account and set a personal password.');
      }
      const bootstrapped = await findOrBootstrapControlStaff(email);
      if (!bootstrapped) {
        redirect('/login?error=No active Control staff record for that email. Add the staff member first or set CONTROL_BOOTSTRAP_ADMIN_EMAIL for initial access.');
      }
      // Bootstrap accounts have no passwordHash — require the shared access key
      if (credential !== process.env.CONTROL_PLANE_ACCESS_KEY?.trim()) {
        redirect('/login?error=Invalid credential.');
      }
      await createControlSession({
        id: bootstrapped.id,
        name: bootstrapped.name,
        email: bootstrapped.email,
        role: normalizeRole(bootstrapped.role),
      });
      redirect('/');
    }

    if (!staff.active) {
      await captureError({ context: 'login:inactive_account', error: new Error('Login attempt on inactive account'), staffEmail: email, staffRole: 'UNKNOWN', metadata: { ip } });
      redirect('/login?error=This Control staff account is inactive.');
    }

    // Per-staff bcrypt password takes priority when set
    if (staff.passwordHash) {
      const valid = await bcrypt.compare(credential, staff.passwordHash);
      if (!valid) {
        await captureError({ context: 'login:bad_password', error: new Error('Invalid password attempt'), staffEmail: email, staffRole: staff.role, metadata: { ip } });
        redirect('/login?error=Invalid password.');
      }
    } else {
      // Legacy shared-key path — still works until staff sets a personal password
      if (!controlBootstrapKeyConfigured()) {
        redirect('/login?error=Ask a Control admin to set your personal password.');
      }
      if (credential !== process.env.CONTROL_PLANE_ACCESS_KEY?.trim()) {
        await captureError({ context: 'login:bad_shared_key', error: new Error('Invalid shared key attempt'), staffEmail: email, staffRole: staff.role, metadata: { ip } });
        redirect('/login?error=Invalid credential. Ask an admin to set your personal password.');
      }
    }

    await createControlSession({
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: normalizeRole(staff.role),
    });
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw error;
    await captureError({ context: 'login:unexpected_error', error, staffEmail: email, staffRole: 'UNKNOWN' });
    redirect(`/login?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to sign in.')}`);
  }

  redirect('/');
}

export async function setStaffPasswordAction(formData: FormData): Promise<void> {
  const { requireControlStaff, canManageStaff } = await import('@/lib/control-auth');
  const actor = await requireControlStaff();

  if (!canManageStaff(actor.role)) {
    redirect('/staff?error=Only Control admins can set staff passwords.');
  }

  const staffId = String(formData.get('staffId') ?? '').trim();
  const password = String(formData.get('password') ?? '').trim();

  if (!staffId || password.length < 10) {
    redirect('/staff?error=Password must be at least 10 characters.');
  }

  const hash = await bcrypt.hash(password, 12);

  try {
    await prisma.controlStaff.update({
      where: { id: staffId },
      data: { passwordHash: hash, passwordSetAt: new Date() },
    });
  } catch {
    redirect('/staff?error=Failed to set password. Check the staff ID and try again.');
  }

  const { revalidatePath } = await import('next/cache');
  revalidatePath('/staff');
  redirect('/staff?updated=staff');
}
