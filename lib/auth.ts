import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

export type Role = 'CASHIER' | 'MANAGER' | 'OWNER';

/**
 * Wrapped with React cache() so that multiple calls within the same
 * server request (e.g. layout + page) only hit the database once.
 */
export const getUser = cache(async () => {
  const token = cookies().get('pos_session')?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true }
  });
  if (!session || session.expiresAt < new Date()) {
    return null;
  }
  return session.user;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) {
    redirect('/login');
  }
  return user;
}

export async function requireRole(roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role as Role)) {
    redirect('/pos');
  }
  return user;
}
