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

/**
 * Authenticate and return the user + their Business record.
 * Always scoped to the logged-in user's businessId.
 */
export async function requireBusiness(roles?: Role[]) {
  const user = roles ? await requireRole(roles) : await requireUser();
  const business = await prisma.business.findUnique({ where: { id: user.businessId } });
  if (!business) redirect('/login');
  return { user, business };
}

/**
 * Authenticate and return user + Business + first Store.
 * Always scoped to the logged-in user's businessId.
 */
export async function requireBusinessStore(roles?: Role[]) {
  const { user, business } = await requireBusiness(roles);
  const store = await prisma.store.findFirst({ where: { businessId: business.id } });
  if (!store) redirect('/settings');
  return { user, business, store };
}
