import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function isAuthorized(request: Request) {
  const token = process.env.METRICS_TOKEN;
  if (!token) {
    return false; // fail closed - misconfiguration should deny access
  }
  const authHeader = request.headers.get('authorization') ?? '';
  const candidate = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  return candidate === token;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Exclude demo businesses from system-wide operational metrics.
  // AuditLog has no Business relation, so filter via businessId lookup.
  const demoBusinessIds = (
    await prisma.business.findMany({ where: { isDemo: true }, select: { id: true } })
  ).map((b) => b.id);
  const excludeDemo = { business: { isDemo: false } };
  const excludeDemoByBusinessId =
    demoBusinessIds.length > 0 ? { businessId: { notIn: demoBusinessIds } } : {};

  const [
    businesses,
    users,
    openShifts,
    todaySales,
    todayPurchases,
    unpaidSales,
    unpaidPurchases,
    recentLoginFailures
  ] = await Promise.all([
    prisma.business.count({ where: { isDemo: false } }),
    prisma.user.count({ where: { active: true, ...excludeDemo } }),
    prisma.shift.count({ where: { status: 'OPEN', till: { store: excludeDemo } } }),
    prisma.salesInvoice.aggregate({
      where: { createdAt: { gte: since }, paymentStatus: { notIn: ['RETURNED', 'VOID'] }, ...excludeDemo },
      _count: { _all: true },
      _sum: { totalPence: true }
    }),
    prisma.purchaseInvoice.aggregate({
      where: { createdAt: { gte: since }, paymentStatus: { notIn: ['RETURNED', 'VOID'] }, ...excludeDemo },
      _count: { _all: true },
      _sum: { totalPence: true }
    }),
    prisma.salesInvoice.count({ where: { paymentStatus: { in: ['UNPAID', 'PART_PAID'] }, ...excludeDemo } }),
    prisma.purchaseInvoice.count({ where: { paymentStatus: { in: ['UNPAID', 'PART_PAID'] }, ...excludeDemo } }),
    prisma.auditLog.count({ where: { action: 'LOGIN_FAILED', createdAt: { gte: since }, ...excludeDemoByBusinessId } })
  ]);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    windowHours: 24,
    counts: {
      businesses,
      activeUsers: users,
      openShifts,
      unpaidSales,
      unpaidPurchases,
      loginFailures24h: recentLoginFailures
    },
    sales24h: {
      count: todaySales._count._all,
      totalPence: todaySales._sum.totalPence ?? 0
    },
    purchases24h: {
      count: todayPurchases._count._all,
      totalPence: todayPurchases._sum.totalPence ?? 0
    }
  });
}
