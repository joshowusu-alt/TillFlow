'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import {
  buildTwoFactorOtpAuthUrl,
  generateTwoFactorSecret,
  verifyTwoFactorCode
} from '@/lib/security/two-factor';

/**
 * Lets ANY logged-in user update their own name, email, and password.
 * They must supply their current password to confirm identity.
 */
export async function updateMyAccountAction(formData: FormData) {
  const user = await requireUser();

  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').toLowerCase().trim();
  const currentPassword = String(formData.get('currentPassword') || '');
  const newPassword = String(formData.get('newPassword') || '');

  if (!name || !email) {
    redirect('/account?error=missing');
  }

  // Require current password to make any changes
  if (!currentPassword) {
    redirect('/account?error=need_password');
  }

  // Verify current password
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) {
    redirect('/login');
  }

  const passwordOk = await bcrypt.compare(currentPassword, dbUser.passwordHash);
  if (!passwordOk) {
    redirect('/account?error=wrong_password');
  }

  // Check email uniqueness (excluding self)
  if (email !== dbUser.email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      redirect('/account?error=duplicate');
    }
  }

  // Build update payload
  const data: { name: string; email: string; passwordHash?: string } = { name, email };

  if (newPassword) {
    if (newPassword.length < 6) {
      redirect('/account?error=password_short');
    }
    data.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  await prisma.user.update({ where: { id: user.id }, data });

  // Invalidate all OTHER sessions when password changes
  if (newPassword) {
    const currentToken = cookies().get('pos_session')?.value;
    await prisma.session.deleteMany({
      where: { userId: user.id, NOT: { token: currentToken ?? '' } },
    });
  }

  await audit({ businessId: user.businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'PASSWORD_CHANGE', entity: 'User', entityId: user.id, details: { nameChanged: name !== dbUser.name, emailChanged: email !== dbUser.email, passwordChanged: !!newPassword } });

  redirect('/account?success=updated');
}

export async function beginTwoFactorSetupAction(formData: FormData) {
  const user = await requireUser();
  const currentPassword = String(formData.get('currentPassword') || '');

  if (!currentPassword) {
    redirect('/account?error=need_password');
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) {
    redirect('/login');
  }

  const passwordOk = await bcrypt.compare(currentPassword, dbUser.passwordHash);
  if (!passwordOk) {
    redirect('/account?error=wrong_password');
  }

  const secret = generateTwoFactorSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorTempSecret: secret }
  });

  await audit({
    businessId: user.businessId,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: 'SETTINGS_UPDATE',
    entity: 'User',
    entityId: user.id,
    details: { twoFactorSetupStarted: true }
  });

  redirect('/account?twofactor=setup');
}

export async function confirmTwoFactorSetupAction(formData: FormData) {
  const user = await requireUser();
  const otp = String(formData.get('otp') || '').trim();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });

  if (!dbUser || !dbUser.twoFactorTempSecret) {
    redirect('/account?error=2fa_not_ready');
  }

  if (!verifyTwoFactorCode(dbUser.twoFactorTempSecret, otp)) {
    redirect('/account?error=2fa_invalid');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: true,
      twoFactorSecret: dbUser.twoFactorTempSecret,
      twoFactorTempSecret: null
    }
  });

  await audit({
    businessId: user.businessId,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: 'SETTINGS_UPDATE',
    entity: 'User',
    entityId: user.id,
    details: { twoFactorEnabled: true }
  });

  redirect('/account?success=2fa_enabled');
}

export async function disableTwoFactorAction(formData: FormData) {
  const user = await requireUser();
  const currentPassword = String(formData.get('currentPassword') || '');
  const otp = String(formData.get('otp') || '').trim();

  if (!currentPassword) {
    redirect('/account?error=need_password');
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) {
    redirect('/login');
  }

  const passwordOk = await bcrypt.compare(currentPassword, dbUser.passwordHash);
  if (!passwordOk) {
    redirect('/account?error=wrong_password');
  }

  if (dbUser.twoFactorEnabled && dbUser.twoFactorSecret) {
    if (!verifyTwoFactorCode(dbUser.twoFactorSecret, otp)) {
      redirect('/account?error=2fa_invalid');
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorTempSecret: null
    }
  });

  await audit({
    businessId: user.businessId,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: 'SETTINGS_UPDATE',
    entity: 'User',
    entityId: user.id,
    details: { twoFactorEnabled: false }
  });

  redirect('/account?success=2fa_disabled');
}

export async function cancelTwoFactorSetupAction() {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorTempSecret: null }
  });
  redirect('/account');
}

export async function getTwoFactorSetupUri() {
  const user = await requireUser();
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { twoFactorTempSecret: true, email: true }
  });
  if (!dbUser?.twoFactorTempSecret) return null;
  return buildTwoFactorOtpAuthUrl(dbUser.twoFactorTempSecret, dbUser.email);
}
