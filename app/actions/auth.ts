'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { cleanupStaleData } from '@/lib/auth';
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

  cookies().set('pos_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt
  });

  await audit({ businessId: user.businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'LOGIN' });
  appLog('info', 'Login successful', { email, ipAddress, userId: user.id });

  // Opportunistic cleanup of expired sessions and old audit logs
  cleanupStaleData(user.businessId).catch(() => {});

  // Redirect owners to onboarding if the business still has the default name
  if (user.role === 'OWNER') {
    const business = await prisma.business.findFirst({
      where: { id: user.businessId },
      select: { name: true },
    });
    if (business?.name === 'Supermarket Demo') {
      redirect('/onboarding');
    }
  }

  redirect('/pos');
}

export async function logout() {
  const cookieStore = cookies();
  const token = cookieStore.get('pos_session')?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
    cookieStore.delete('pos_session');
  }
  redirect('/login');
}
