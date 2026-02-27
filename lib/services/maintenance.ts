import { prisma } from '@/lib/prisma';

/**
 * Opportunistic cleanup: delete expired sessions and archive old audit logs.
 * Called during login — fire-and-forget, never throws.
 */
export async function cleanupStaleData(businessId: string): Promise<void> {
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
