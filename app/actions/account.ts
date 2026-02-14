'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

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

  redirect('/account?success=updated');
}
