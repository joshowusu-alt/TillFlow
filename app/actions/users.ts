'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

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

  redirect('/users?success=created');
}

export async function updateUserAction(formData: FormData) {
  await requireRole(['OWNER']);

  const userId = String(formData.get('userId') || '');
  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').toLowerCase().trim();
  const role = String(formData.get('role') || 'CASHIER');
  const active = formData.get('active') === 'on';
  const newPassword = String(formData.get('newPassword') || '');

  if (!userId || !name || !email) {
    redirect('/users?error=missing');
  }

  // Check for duplicate email (excluding this user)
  const existing = await prisma.user.findFirst({
    where: { email, NOT: { id: userId } },
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

  await prisma.user.update({ where: { id: userId }, data });

  redirect('/users?success=updated');
}

export async function toggleUserActiveAction(formData: FormData) {
  await requireRole(['OWNER']);

  const userId = String(formData.get('userId') || '');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) redirect('/users');

  await prisma.user.update({
    where: { id: userId },
    data: { active: !user!.active },
  });

  redirect('/users');
}
