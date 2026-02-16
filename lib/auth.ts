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
 * Cached business lookup — only hits DB once per request even if
 * called from both layout and page.
 */
const _getBusiness = cache(async (businessId: string) => {
  return prisma.business.findUnique({ where: { id: businessId } });
});

/**
 * Cached store lookup — only hits DB once per request.
 */
const _getStore = cache(async (businessId: string) => {
  return prisma.store.findFirst({ where: { businessId } });
});

/**
 * Authenticate and return the user + their Business record.
 * Always scoped to the logged-in user's businessId.
 */
export async function requireBusiness(roles?: Role[]) {
  const user = roles ? await requireRole(roles) : await requireUser();
  const business = await _getBusiness(user.businessId);
  if (!business) redirect('/login');
  return { user, business };
}

/**
 * Authenticate and return user + Business + first Store.
 * Always scoped to the logged-in user's businessId.
 */
export async function requireBusinessStore(roles?: Role[]) {
  const { user, business } = await requireBusiness(roles);
  const store = await _getStore(business.id);
  if (!store) redirect('/settings');
  return { user, business, store };
}

/**
 * Opportunistic cleanup: delete expired sessions and old audit logs.
 * Called during login — fire-and-forget, never throws.
 */
export async function cleanupStaleData(businessId: string) {
  try {
    // Delete expired sessions
    await prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    // Archive audit logs older than 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    await prisma.auditLog.deleteMany({
      where: {
        businessId,
        createdAt: { lt: sixMonthsAgo },
      },
    });
  } catch (err) {
    // Non-fatal — don't block login
    console.error('[cleanup] Failed:', err);
  }
}
