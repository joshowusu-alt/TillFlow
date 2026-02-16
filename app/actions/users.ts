'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { audit } from '@/lib/audit';

export async function createUserAction(formData: FormData) {
  const owner = await requireRole(['OWNER']);

  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').toLowerCase().trim();
  const password = String(formData.get('password') || '');
  const role = String(formData.get('role') || 'CASHIER');

  if (!name || !email || !password) {
    redirect('/users?error=missing');
  }

  if (password.length < 6) {
    redirect('/users?error=password_short');
  }

  // Check for duplicate email
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect('/users?error=duplicate');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      businessId: owner.businessId,
      name,
      email,
      passwordHash,
      role,
      active: true,
    },
  });

  await audit({ businessId: owner.businessId, userId: owner.id, userName: owner.name, userRole: owner.role, action: 'USER_CREATE', entity: 'User', details: { name, email, role } });

  redirect('/users?success=created');
}

export async function updateUserAction(formData: FormData) {
  const owner = await requireRole(['OWNER']);

  const userId = String(formData.get('userId') || '');
  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').toLowerCase().trim();
  const role = String(formData.get('role') || 'CASHIER');
  const active = formData.get('active') === 'on';
  const newPassword = String(formData.get('newPassword') || '');

  if (!userId || !name || !email) {
    redirect('/users?error=missing');
  }

  const targetUser = await prisma.user.findFirst({
    where: { id: userId, businessId: owner.businessId },
    select: { id: true },
  });
  if (!targetUser) {
    redirect('/users?error=not_found');
  }

  // Check for duplicate email (excluding this user)
  const existing = await prisma.user.findFirst({
    where: { email, NOT: { id: targetUser.id } },
  });
  if (existing) {
    redirect('/users?error=duplicate');
  }

  const data: Record<string, unknown> = { name, email, role, active };

  if (newPassword) {
    if (newPassword.length < 6) {
      redirect('/users?error=password_short');
    }
    data.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  await prisma.user.update({ where: { id: targetUser.id }, data });

  // Invalidate all sessions when password is changed or user is deactivated
  if (newPassword || !active) {
    await prisma.session.deleteMany({ where: { userId: targetUser.id } });
  }

  await audit({ businessId: owner.businessId, userId: owner.id, userName: owner.name, userRole: owner.role, action: 'USER_UPDATE', entity: 'User', entityId: targetUser.id, details: { name, email, role, active } });

  redirect('/users?success=updated');
}

export async function toggleUserActiveAction(formData: FormData) {
  const owner = await requireRole(['OWNER']);

  const userId = String(formData.get('userId') || '');
  const user = await prisma.user.findFirst({
    where: { id: userId, businessId: owner.businessId },
  });
  if (!user) redirect('/users');

  if (user.id === owner.id) {
    redirect('/users?error=self_toggle');
  }

  const nowActive = !user!.active;
  await prisma.user.update({
    where: { id: user.id },
    data: { active: nowActive },
  });

  // Invalidate all sessions when deactivating a user
  if (!nowActive) {
    await prisma.session.deleteMany({ where: { userId: user.id } });
  }

  await audit({ businessId: owner.businessId, userId: owner.id, userName: owner.name, userRole: owner.role, action: nowActive ? 'USER_UPDATE' : 'USER_DEACTIVATE', entity: 'User', entityId: user.id, details: { name: user.name, active: nowActive } });

  redirect('/users');
}
