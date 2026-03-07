'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { cleanupStaleData } from '@/lib/services/maintenance';
import { headers } from 'next/headers';
import { clearLoginFailures, getLoginThrottleStatus, recordLoginFailure } from '@/lib/security/login-throttle';
import { verifyTwoFactorCode } from '@/lib/security/two-factor';
import { appLog } from '@/lib/observability';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MAX_ACTIVE_SESSIONS = 5;

function getClientIpAddress() {
  const headerStore = headers();
  const forwarded = headerStore.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = headerStore.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

function getClientUserAgent() {
  const value = headers().get('user-agent') ?? '';
  return value.slice(0, 255) || null;
}

export async function login(formData: FormData) {
  const email = String(formData.get('email') || '').toLowerCase();
  const password = String(formData.get('password') || '');
  const otp = String(formData.get('otp') || '').trim();

  if (!email || !password) {
    redirect('/login?error=missing');
  }

  const ipAddress = getClientIpAddress();
  const userAgent = getClientUserAgent();

  try {

  const throttleStatus = await getLoginThrottleStatus(email, ipAddress);
  if (throttleStatus.isBlocked) {
    appLog('warn', 'Login blocked by rate limiter', { email, ipAddress });
    redirect('/login?error=locked');
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    await recordLoginFailure(email, ipAddress);
    appLog('warn', 'Login failed for unknown or inactive user', { email, ipAddress });
    redirect('/login?error=invalid');
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    await recordLoginFailure(email, ipAddress);
    appLog('warn', 'Login failed due to password mismatch', { email, ipAddress, userId: user.id });
    await audit({
      businessId: user.businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'LOGIN_FAILED',
      details: { reason: 'password_mismatch', ipAddress }
    });
    redirect('/login?error=invalid');
  }

  if (user.twoFactorEnabled) {
    if (!otp) {
      await recordLoginFailure(email, ipAddress);
      appLog('warn', 'Login failed because OTP was missing', { email, ipAddress, userId: user.id });
      redirect('/login?error=otp_required');
    }
    if (!user.twoFactorSecret || !verifyTwoFactorCode(user.twoFactorSecret, otp)) {
      await recordLoginFailure(email, ipAddress);
      appLog('warn', 'Login failed due to invalid OTP', { email, ipAddress, userId: user.id });
      await audit({
        businessId: user.businessId,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'LOGIN_FAILED',
        details: { reason: 'otp_invalid', ipAddress }
      });
      redirect('/login?error=otp_invalid');
    }
  }

  await clearLoginFailures(email, ipAddress);

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      token,
      userId: user.id,
      ipAddress,
      userAgent,
      expiresAt
    }
  });

  const staleSessions = await prisma.session.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    skip: MAX_ACTIVE_SESSIONS,
    select: { id: true }
  });
  if (staleSessions.length > 0) {
    await prisma.session.deleteMany({
      where: { id: { in: staleSessions.map((session) => session.id) } }
    });
  }

  const isSecure =
    process.env.NODE_ENV === 'production' &&
    !process.env.BASE_URL?.startsWith('http://');

  // Use business-scoped cookie name so logging into a second business
  // does not overwrite the first business's session cookie.
  // Clear any other business sessions first so tabs don't silently
  // serve the wrong business's data.
  const cookieStore = cookies();
  const oldBusinessCookies = cookieStore.getAll().filter(c => c.name.startsWith('pos_session_'));
  if (oldBusinessCookies.length > 0) {
    const oldTokens = oldBusinessCookies.map(c => c.value).filter(Boolean);
    if (oldTokens.length > 0) {
      await prisma.session.deleteMany({ where: { token: { in: oldTokens } } });
    }
    for (const c of oldBusinessCookies) { cookieStore.delete(c.name); }
  }
  cookieStore.set(`pos_session_${user.businessId}`, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt
  });

  await audit({ businessId: user.businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'LOGIN' });
  appLog('info', 'Login successful', { email, ipAddress, userId: user.id });

  // Opportunistic cleanup of expired sessions and old audit logs
  cleanupStaleData(user.businessId).catch(() => {});

  // Redirect owners to onboarding if guided setup has not yet been completed
  if (user.role === 'OWNER') {
    const business = await prisma.business.findFirst({
      where: { id: user.businessId },
      select: { guidedSetup: true },
    });
    if (business?.guidedSetup) {
      redirect('/onboarding');
    }
  }

  redirect('/pos');
  } catch (err: unknown) {
    // redirect() throws a special internal error — always re-throw it
    if (isRedirectError(err)) throw err;
    appLog('error', 'Login error', { error: String(err) });
    redirect('/login?error=server');
  }
}

export async function logout() {
  const cookieStore = cookies();
  const sessionCookies = cookieStore.getAll().filter(c => c.name.startsWith('pos_session_'));
  if (sessionCookies.length > 0) {
    const tokens = sessionCookies.map(c => c.value).filter(Boolean);
    if (tokens.length > 0) {
      await prisma.session.deleteMany({ where: { token: { in: tokens } } });
    }
    for (const c of sessionCookies) { cookieStore.delete(c.name); }
  }
  redirect('/login');
}
