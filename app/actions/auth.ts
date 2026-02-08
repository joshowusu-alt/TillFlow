'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function login(formData: FormData) {
  const email = String(formData.get('email') || '').toLowerCase();
  const password = String(formData.get('password') || '');

  if (!email || !password) {
    redirect('/login?error=missing');
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    redirect('/login?error=invalid');
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    redirect('/login?error=invalid');
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await prisma.session.create({
    data: {
      token,
      userId: user.id,
      expiresAt
    }
  });

  cookies().set('pos_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt
  });

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
