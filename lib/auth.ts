import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

export type Role = 'CASHIER' | 'MANAGER' | 'OWNER';

/**
 * Wrapped with React cache() so that multiple calls within the same
 * server request (e.g. layout + page) only hit the database once.
 */
/**
 * Helper to delete the pos_session cookie so stale tokens
 * don't cause redirect loops between middleware and auth.
 */
function clearSessionCookie() {
  try {
    cookies().delete('pos_session');
  } catch {
    // cookies().delete can throw in certain rendering contexts
  }
}

export const getUser = cache(async () => {
  const token = cookies().get('pos_session')?.value;
  if (!token) return null;

  let session;
  try {
    session = await prisma.session.findUnique({
      where: { token },
      select: {
        id: true,
        expiresAt: true,
        userAgent: true,
        ipAddress: true,
        lastSeenAt: true,
        user: {
          select: {
            id: true,
            businessId: true,
            name: true,
            email: true,
            role: true,
            active: true,
            twoFactorEnabled: true,
            twoFactorTempSecret: true,
          }
        }
      }
    });
  } catch (err) {
    // DB connection failure — clear stale cookie so user can reach /login
    console.error('[auth] DB lookup failed:', err);
    clearSessionCookie();
    return null;
  }

  if (!session) {
    // Session token in cookie but not in DB — clear stale cookie
    clearSessionCookie();
    return null;
  }

  if (session.expiresAt < new Date()) {
    prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    clearSessionCookie();
    return null;
  }

  const headerStore = headers();
  const currentUserAgent = (headerStore.get('user-agent') ?? '').slice(0, 255) || null;
  if (session.userAgent && currentUserAgent && session.userAgent !== currentUserAgent) {
    prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    clearSessionCookie();
    return null;
  }

  // Only update lastSeenAt once every 5 minutes to avoid a write on every request
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  if (!session.lastSeenAt || session.lastSeenAt < fiveMinAgo) {
    const forwarded = headerStore.get('x-forwarded-for');
    const currentIp =
      forwarded?.split(',')[0]?.trim() || headerStore.get('x-real-ip') || 'unknown';
    // Fire-and-forget — don't await
    prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), ipAddress: currentIp || session.ipAddress }
    }).catch(() => {});
  }

  return session.user;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) {
    // getUser already clears the stale cookie, so redirect will work
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
  return prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      currency: true,
      vatEnabled: true,
      vatNumber: true,
      mode: true,
      receiptTemplate: true,
      printMode: true,
      printerName: true,
      receiptLogoUrl: true,
      receiptHeader: true,
      receiptFooter: true,
      receiptShowVatNumber: true,
      receiptShowAddress: true,
      socialMediaHandle: true,
      address: true,
      phone: true,
      tinNumber: true,
      momoEnabled: true,
      momoProvider: true,
      momoNumber: true,
      openingCapitalPence: true,
      requireOpenTillForSales: true,
      varianceReasonRequired: true,
      discountApprovalThresholdBps: true,
      inventoryAdjustmentRiskThresholdBase: true,
      cashVarianceRiskThresholdPence: true,
      customerScope: true,
      whatsappEnabled: true,
      whatsappPhone: true,
      whatsappScheduleTime: true,
      whatsappBranchScope: true,
      isDemo: true,
      onboardingCompletedAt: true,
      hasDemoData: true,
      guidedSetup: true,
      createdAt: true,
    }
  });
});

/**
 * Cached store lookup — only hits DB once per request.
 */
const _getStore = cache(async (businessId: string) => {
  return prisma.store.findFirst({
    where: { businessId },
    select: { id: true, name: true, address: true, businessId: true }
  });
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
 * Fetches business and store in parallel to reduce latency.
 */
export async function requireBusinessStore(roles?: Role[]) {
  const user = roles ? await requireRole(roles) : await requireUser();
  const [business, store] = await Promise.all([
    _getBusiness(user.businessId),
    _getStore(user.businessId),
  ]);
  if (!business) redirect('/login');
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
