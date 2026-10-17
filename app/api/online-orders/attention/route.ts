import { NextResponse } from 'next/server';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import { getFeatures } from '@/lib/features';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { user, business, store } = await requireBusinessAndOptionalStore(['CASHIER', 'MANAGER', 'OWNER']);
  const features = getFeatures((business as any).plan ?? business.mode, (business as any).storeMode,
    { onlineStorefront: Boolean((business as any).addonOnlineStorefront) });
  if (!features.onlineStorefront || (user.role === 'CASHIER' && !store)) {
    return NextResponse.json({ count: 0, orders: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const where = {
    businessId: business.id,
    ...(store ? { storeId: store.id } : {}),
    OR: [
      { status: { in: ['AWAITING_PAYMENT', 'PAYMENT_FAILED', 'PAID', 'PROCESSING', 'READY_FOR_PICKUP'] } },
      { refundStatus: 'MANUAL_REFUND_NEEDED' },
      { paymentStatus: 'PAID', salesInvoiceId: null, status: { not: 'CANCELLED' } },
    ],
  };
  const [newest, count, orders] = await Promise.all([
    prisma.onlineOrder.findFirst({ where, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true } }),
    prisma.onlineOrder.count({ where }),
    prisma.onlineOrder.findMany({ where, orderBy: { createdAt: 'asc' }, take: 5,
      select: { id: true, orderNumber: true, status: true, paymentStatus: true, refundStatus: true,
        salesInvoiceId: true, totalPence: true, currency: true, createdAt: true,
        store: { select: { name: true } } } }),
  ]);
  // Identity changes when a new order arrives even if the total stays the same.
  return NextResponse.json({ count, orders, newestId: newest?.id ?? null, newestAt: newest?.createdAt ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}
